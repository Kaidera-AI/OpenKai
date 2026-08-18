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

interface HubOptions {
  port: number;
  host?: string;
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
  server.listen(options.port, host, listening.resolve);
  await listening.promise;
  process.stderr.write(`openkai hub listening on http://${urlHost}:${options.port} (bearer-gated; /health open)\n`);
  // Keep the process alive until SIGINT/SIGTERM.
  const shutdown = Promise.withResolvers<void>();
  process.on("SIGINT", shutdown.resolve);
  process.on("SIGTERM", shutdown.resolve);
  await shutdown.promise;
  server.close();
  return 0;
}
