/**
 * Hub daemon (`openkai serve`) — Cline's detached-hub pattern: a long-lived
 * loopback HTTP server that exposes the harness headlessly so other tools
 * (editors, scripts, chat connectors) can drive sessions without a TTY.
 *
 * Security posture (ahead of the K3 review):
 *  - binds 127.0.0.1 ONLY (never 0.0.0.0) unless --host names another
 *    loopback address (localhost / ::1) — index.ts wires only the flag;
 *  - every endpoint except GET /health requires
 *    `Authorization: Bearer <OPENKAI_HUB_TOKEN>` (the hub refuses to start
 *    without a token); the compare is timing-safe over SHA-256 digests;
 *  - the Host header must be a loopback host with the bound port
 *    (127.0.0.1:<port>, localhost:<port>, [::1]:<port>) on EVERY request —
 *    blocks DNS-rebinding against the loopback listener;
 *  - request bodies are capped at 1 MiB (413 beyond).
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { runChat } from "./chat.js";
import {
  allowedHostsFor,
  bearerDigest,
  bearerMatches,
  BodyTooLargeError,
  isLoopbackHost,
  readBody,
  urlHost,
} from "./http-common.js";
import { HostedTui } from "./tui/headless-host.js";
import { handshakeResponseHeaders, WsChannel } from "./ws.js";

interface HubOptions {
  port: number;
  host?: string;
  /** Optional abort signal (tests embed the hub and stop it cleanly). */
  signal?: AbortSignal;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

export async function runHub(options: HubOptions): Promise<number> {
  const token = process.env.OPENKAI_HUB_TOKEN;
  if (!token) {
    process.stderr.write(
      "openkai serve: OPENKAI_HUB_TOKEN is required (the hub refuses to start without a bearer token).\n",
    );
    return 1;
  }
  const tokenHash = bearerDigest(token);
  const host = options.host ?? "127.0.0.1";
  if (!isLoopbackHost(host)) {
    process.stderr.write(`openkai serve: refusing non-loopback host ${host} (loopback only).\n`);
    return 1;
  }
  // DNS-rebinding guard: only the loopback hosts this hub binds, with port.
  const allowedHosts = allowedHostsFor(options.port);

  // ── OK-10 served TUI: hosted sessions + WS attach channel ──────────────
  const hosted = new Map<string, HostedTui>();

  /** Register the WS attach channel on the HTTP server (called post-create). */
  const registerAttachChannel = (srv: ReturnType<typeof createServer>): void => {
    srv.on("upgrade", (req, socket, head) => {
      const fail = (status: number, message: string): void => {
        socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
      };
      try {
        const reqHost = req.headers.host;
        if (!reqHost || allowedHosts[reqHost] !== true) return fail(403, "Forbidden");
        if (!bearerMatches(req.headers.authorization, tokenHash)) return fail(401, "Unauthorized");
        const url = new URL(req.url ?? "/", `http://${urlHost(host)}:${options.port}`);
        const match = /^\/attach\/([^/?]+)(?:\?.*)?$/.exec(url.pathname);
        if (!match) return fail(404, "Not Found");
        const hostedSession = hosted.get(match[1]!);
        if (!hostedSession) return fail(404, "Not Found");
        const mode = url.searchParams.get("mode") === "rw" ? "rw" : "ro";
      const key = req.headers["sec-websocket-key"];
      if (typeof key !== "string") return fail(400, "Bad Request");
      socket.write(handshakeResponseHeaders(key));
      if (head.length > 0) socket.unshift(head);

      const channel = new WsChannel(socket, (msg) => {
        if (msg.kind !== "text") return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(msg.text);
        } catch {
          return;
        }
        if (parsed === null || typeof parsed !== "object" || !("type" in parsed)) return;
        // S5: input is rw-scoped at the seam; ro attaches may only resize.
        if (parsed.type === "input" && mode === "rw" && "data" in parsed && typeof parsed.data === "string") {
          hostedSession.input(parsed.data);
        } else if (parsed.type === "resize" && "columns" in parsed && "rows" in parsed) {
          const columns = Number(parsed.columns);
          const rows = Number(parsed.rows);
          if (Number.isFinite(columns) && Number.isFinite(rows) && columns >= 20 && rows >= 4) {
            hostedSession.resize(columns, rows);
          }
        }
      }, () => {
        // Socket closed — attaches are ephemeral; the hosted session lives on.
      });

      // Attach hello (S3): the settled frame at the client's width, then the
      // live frame/state streams via the host's tap registry.
      const widthParam = Number(url.searchParams.get("width") ?? "100");
      const width = Number.isFinite(widthParam) && widthParam >= 20 ? widthParam : 100;
      channel.send(JSON.stringify({ type: "hello", sessionId: hostedSession.sessionId, mode, frame: hostedSession.settledFrame(width) }));
      hostedSession.addTap(
        (frame) => channel.send(JSON.stringify({ type: "frame", data: frame })),
        (state) => channel.send(JSON.stringify({ type: "state", state })),
      );
    } catch {
      try {
        socket.destroy();
      } catch {
        // best effort
      }
    }
  });
  };

  const server = createServer(async (req, res) => {
    const reqHost = req.headers.host;
    if (!reqHost || allowedHosts[reqHost] !== true) {
      json(res, 403, { error: "forbidden host — loopback only" });
      return;
    }

    const url = new URL(req.url ?? "/", `http://${urlHost(host)}:${options.port}`);
    const authorized = bearerMatches(req.headers.authorization, tokenHash);

    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true, version: "openkai", uptime: process.uptime() });
      return;
    }

    // Everything below carries session/memory state or executes work — gated.
    if (!authorized) {
      json(res, 401, { error: "unauthorized — send Authorization: Bearer <OPENKAI_HUB_TOKEN>" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/sessions") {
      const dir = path.join(process.env.OPENKAI_HOME ?? path.join(homedir(), ".openkai"), "sessions");
      let sessions: string[] = [];
      try {
        sessions = readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
      } catch {
        sessions = [];
      }
      json(res, 200, { sessions });
      return;
    }

    if (req.method === "GET" && url.pathname === "/memory") {
      const file = path.join(process.cwd(), ".openkai", "memory", "learnings.md");
      if (!existsSync(file)) {
        json(res, 200, { learnings: [] });
        return;
      }
      const lines = readFileSync(file, "utf-8")
        .split("\n")
        .filter((l) => l.startsWith("- ["));
      json(res, 200, { learnings: lines });
      return;
    }

    // OK-10: create a hosted TUI session (attach target for browsers).
    if (req.method === "POST" && url.pathname === "/sessions") {
      let raw: string;
      try {
        raw = await readBody(req);
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          json(res, 413, { error: "payload too large — body cap is 1 MiB" });
          return;
        }
        json(res, 400, { error: "failed to read request body" });
        return;
      }
      let body: { model?: string; provider?: string };
      try {
        body = JSON.parse(raw || "{}") as typeof body;
      } catch {
        json(res, 400, { error: "invalid JSON body" });
        return;
      }
      const modelId = body.model ?? process.env.OPENKAI_MODEL ?? "nvidia/nemotron-3-nano-30b-a3b:free";
      try {
        const host = await HostedTui.start({
          cwd: process.cwd(),
          modelId,
          ...(body.provider !== undefined ? { provider: body.provider } : {}),
          onFrame: () => undefined, // attaches tap their own listeners
        });
        hosted.set(host.sessionId, host);
        json(res, 200, { sessionId: host.sessionId, attach: `/attach/${host.sessionId}?mode=ro|rw` });
      } catch (error) {
        json(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/prompt") {
      let raw: string;
      try {
        raw = await readBody(req);
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          json(res, 413, { error: "payload too large — body cap is 1 MiB" });
          return;
        }
        json(res, 400, { error: "failed to read request body" });
        return;
      }
      let body: { text?: string; model?: string; provider?: string };
      try {
        body = JSON.parse(raw) as typeof body;
      } catch {
        json(res, 400, { error: "invalid JSON body" });
        return;
      }
      if (!body.text || typeof body.text !== "string") {
        json(res, 400, { error: "text is required" });
        return;
      }
      try {
        const result = await runChat({
          prompt: body.text,
          model: body.model,
          provider: body.provider,
          quiet: true,
        });
        json(res, 200, { exitCode: result.exitCode, sessionId: result.sessionId });
      } catch (error) {
        json(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    json(res, 404, { error: "not found" });
  });

  const listening = Promise.withResolvers<void>();
  registerAttachChannel(server);
  server.listen(options.port, host, listening.resolve);
  await listening.promise;
  process.stderr.write(`openkai hub listening on http://${urlHost(host)}:${options.port} (bearer-gated; /health open; /attach for hosted TUI)\n`);
  // Keep the process alive until SIGINT/SIGTERM (or an embedding test aborts).
  const shutdown = Promise.withResolvers<void>();
  process.on("SIGINT", shutdown.resolve);
  process.on("SIGTERM", shutdown.resolve);
  if (options.signal) {
    if (options.signal.aborted) shutdown.resolve();
    else options.signal.addEventListener("abort", () => shutdown.resolve(), { once: true });
  }
  await shutdown.promise;
  server.close();
  await Promise.allSettled([...hosted.values()].map((h) => h.close()));
  return 0;
}
