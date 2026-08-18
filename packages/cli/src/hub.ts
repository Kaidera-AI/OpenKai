/**
 * Hub daemon (`openkai serve`) — Cline's detached-hub pattern: a long-lived
 * loopback HTTP server that exposes the harness headlessly so other tools
 * (editors, scripts, chat connectors) can drive sessions without a TTY.
 *
 * Security posture (ahead of the K3 review):
 *  - binds 127.0.0.1 ONLY (never 0.0.0.0) unless OPENKAI_HUB_HOST overrides;
 *  - mutating endpoints (POST /prompt) require `Authorization: Bearer <token>`
 *    where the token is OPENKAI_HUB_TOKEN (refuses to start without one);
 *  - read endpoints (/health, /sessions, /memory) are token-free but only
 *    ever served on loopback.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { runChat } from "./chat.js";

interface HubOptions {
  port: number;
  host?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
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
  const host = options.host ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    process.stderr.write(`openkai serve: refusing non-loopback host ${host} (loopback only).\n`);
    return 1;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    const authorized = req.headers.authorization === `Bearer ${token}`;

    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true, version: "openkai", uptime: process.uptime() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/sessions") {
      const dir = path.join(process.env.OPENKAI_HOME ?? path.join(homedir(), ".openkai"), "sessions");
      let sessions: string[] = [];
      try {
        const { readdirSync } = await import("node:fs");
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
      if (!authorized) {
        json(res, 401, { error: "unauthorized — send Authorization: Bearer <OPENKAI_HUB_TOKEN>" });
        return;
      }
      let body: { text?: string; model?: string; provider?: string };
      try {
        body = JSON.parse(await readBody(req)) as typeof body;
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

  await new Promise<void>((resolve) => server.listen(options.port, host, resolve));
  process.stderr.write(`openkai hub listening on http://${host}:${options.port} (token-gated /prompt)\n`);
  // Keep the process alive until SIGINT/SIGTERM.
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      server.close(() => resolve());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return 0;
}
