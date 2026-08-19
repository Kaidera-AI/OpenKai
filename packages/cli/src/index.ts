#!/usr/bin/env node
/**
 * openkai — operator CLI for the OpenKai harness.
 *
 * P1: `openkai events --print` streams the project's live Cortex team_events.
 * P2: `openkai chat --prompt …` runs the single-lane agent loop (OpenRouter),
 *      persisting the session JSONL v3 tree under `.openkai/sessions/` and
 *      checkpointing to Cortex (`POST /sessions/ingest` + `POST /log`).
 *      `openkai sessions` lists the local session tree.
 */

import { CortexClient } from "@kaidera/openkai-core";
import type { TeamEventEntry } from "@kaidera/openkai-core";
import {
  aggregateFusionRuns,
  DEFAULT_MODEL_ID,
  readFusionRuns,
  renderFusionDashboard,
} from "@kaidera/openkai-core";
import { runChat, type ChatOptions } from "./chat.js";
import { loadDotEnv } from "./env.js";
import { runFuse, type FuseCliOptions } from "./fuse.js";
import { runFusionAdvise, runFusionCalibrate, runFusionReport } from "./fusion.js";
import { runInfo } from "./info.js";
import { helpIndex, helpTopic } from "./help.js";
import { runLogin } from "./login.js";
import { runTui, type RunTuiOptions } from "./tui/runtime.js";
import { runSessions, type SessionsOptions } from "./sessions.js";
import { runTail } from "./tail.js";
import { runUndo } from "./undo.js";
import { runSkillsAdd, runSkillsBind, runSkillsList, runSkillsRemove } from "./skills.js";
import { runMcpAdd, runMcpList, runMcpRemove, runMcpTest } from "./mcp.js";
import { runStatusline } from "./statusline.js";
import { CLI_VERSION } from "./version.js";
import { runProvider } from "./provider-cli.js";
import { createServer, type ServerResponse } from "node:http";
import { classifyConnectorPayload } from "./connectors.js";
import {
  allowedHostsFor,
  bearerDigest,
  bearerMatches,
  BodyTooLargeError,
  isLoopbackHost,
  readBody,
  urlHost,
} from "./http-common.js";

// .env from the current directory loads before any command resolves config;
// real environment variables always win over file values.
loadDotEnv();
import { runUpgrade, type UpgradeCliOptions } from "./upgrade.js";

const USAGE = `openkai — OpenKai operator CLI

Usage:
  openkai chat --prompt <text> [options]
  openkai sessions [--show <id>] [options]
  openkai events --print [options]

Commands:
  openkai                Launch the TUI shell (same as openkai tui).

  tui [options]          Launch the pi-tui alt-screen TUI shell (P4).

  chat --prompt <text>   Run a single-prompt agent turn over OpenRouter and
                         stream the reply to stdout. Persists the session
                         JSONL v3 tree under .openkai/sessions/ and
                         checkpoints it to Cortex.

  sessions [--show <id>] List local persisted sessions (.openkai/sessions/),
                         or show the full entry tree for one session id.

  fuse --prompt <text>   Run one task through the fusion core (P3): architect
                         + builder as separate fresh sessions in parallel,
                         then an attributed synthesis. --gate wraps the run in
                         gate-first validation (FU-3).

  fusion report [--last n]  Per-model-pair A/B stats from the fusion runs log
                         (.openkai/fusion/runs.jsonl).

  fusion advise          Evaluate the FU-4 invocation policy for a task shape:
                         --priority low|medium|high|urgent
                         --class architecture|ambiguous|high-blast-radius|routine
                         --files <n>  (expected blast radius)

  fusion calibrate       OK-9 W6/W7 calibration harness: RESCUE/LOSS/SAFE/HARD
                         quadrant table, threshold sweep recommendation, and
                         the judge break-even line.
                         --runs <path>       runs JSONL (default .openkai/fusion/runs.jsonl)
                         --baseline <path>   capable-only baseline JSONL to merge
                         --judge-model/--cheap-model/--dear-model <id>
                         --provider <id>     catalogue lane for the pricing models
                         --record-dir <path> dated-record directory
                                             (default research/calibration)

  undo [--history]       Restore the work tree to the previous shadow-git
                         snapshot (taken before every gated mutation);
                         --history lists snapshots newest-first.

  login <provider>       Authenticate a subscription lane (openai-codex,
                         github-copilot, anthropic) via OAuth device flow.

  tail [-f] [-n N]       Live activity feed: turn starts, tool calls, results,
                         tokens — what the agent is doing right now
                         (.openkai/activity.jsonl). -f follows like tail -f.

  info                   Self-check: version, run mode (standalone-local /
                         KOS-managed), Cortex reachability, model catalogue,
                         local state counts. Always exits 0.

  upgrade | update       Self-upgrade (standalone channel; rollback with
                         --rollback, check only with --check).

  skills [list|add|remove|bind]   Manage skills (.agents/skills/ + Cortex
                         registry). \`add <path>\` installs a local skill folder;
                         \`remove <slug>\` deletes from registry + disk;
                         \`bind <slug> --to <role>\` binds a skill to a subject.

  mcp [list|add|remove|test]       Manage MCP servers in the harness config
                         (~/.openkai/config.json mcpServers). \`add <name>
                         --command <cmd>\` (stdio) or \`--url <url>\` (remote);
                         \`test <name>\` spawns --help or probes the URL.

  provider [list|set|unset]        Manage provider credentials — the single
                         write path shared with the TUI and KOS Settings.
                         \`set <id> --key <value>\` writes to the 0600 store;
                         \`unset <id>\` removes it. Non-interactive.

  statusline             Show/configure status chrome chips:
                         --set <a,b,c> | --hide <chip> | --show <chip> | --reset
                         Chips: agent, model, session, tokens, persist,
                         provider, state.

  events --print         Stream live Cortex team events (GET /events SSE) to
                         stdout, one TSV row per event:
                         id <TAB> type <TAB> agent <TAB> summary

Options:
  --prompt <text>        (chat) The user prompt for the turn.
  --provider <id>        Provider: openrouter (default), anthropic, openai,
                         google, deepseek, kimi-coding, qwen-token-plan, xai,
                         mistral, groq, cerebras, together, fireworks, nvidia,
                         minimax, zai, vercel-ai-gateway. Keys live in .env.
  --model <id>           Model id within the provider's catalogue
                         (default: $OPENKAI_MODEL or ${DEFAULT_MODEL_ID}).
  --system-prompt <text> (chat) Override the system prompt.
  --show <id>            (sessions) Show full entries for one session id.
  --session <id>        (tui) Resume a session by id.
  --architect-model <id> (fuse) Architect role model (default: $OPENKAI_MODEL).
  --builder-model <id>  (fuse) Builder role model (default: same as architect).
  --judge-model <id>    (fuse) Synthesis/gate-validator model.
  --gate                (fuse) Enable gate-first validation (FU-3).
  --yes                 (fuse --gate) Approve executing the validator-designed
                         checks (model-authored shell, operator privileges).
  --max-rounds <n>      (fuse) Gate repair cap, 1-10 (default 3).
  --model <id>           (tui) OpenRouter model id (default: $OPENKAI_MODEL).
  --last-id <id>         (events) Resume after a team_events id.
  --count <n>            (events) Events per server read, 1-200 (default 50).
  --ping <seconds>       (events) Server keep-alive cadence, 1-60 (default 15).
  --project <key>        Cortex project (default: $CORTEX_PROJECT or openkai).
  --api <url>            Cortex API base URL
                         (default: $CORTEX_API_URL or http://localhost:8501).
  --agent <name>         Agent name for Cortex writes / X-Agent-Name.
  --quiet                (chat) Suppress stderr diagnostics (deltas still stream).
  --keepalive            (events) Print ': ping' keep-alive ticks.
  --verbose              (events) Print connect/retry diagnostics to stderr.
  -h, --help             Show this help.

Environment:
  OPENROUTER_API_KEY     Required for \`chat\` — OpenRouter API key.
  OPENKAI_MODEL          Default chat model (overrides the built-in default).
  CORTEX_PROJECT         Cortex project scope (default: openkai).
  CORTEX_API_URL         Cortex API base URL.
  OPENKAI_CHANNEL        Override upgrade channel: standalone | npm.
  OPENKAI_AUTO_UPDATE_ENABLED  Kill-switch: "false" disables standalone
                         self-upgrade entirely (rollback still works).
  OPENKAI_MANIFEST_URL   Release manifest URL (default:
                         https://openkai.dev/releases/latest.json).
  OPENKAI_RELEASE_PUBLIC_KEY  Base64 DER SPKI Ed25519 key; when set, manifest
                         signatures are verified before any swap.
`;

interface EventsOptions {
  lastId?: string;
  count?: number;
  pingSeconds?: number;
  project?: string;
  api?: string;
  agent?: string;
  keepalive: boolean;
  verbose: boolean;
}

const fail = (message: string): number => {
  process.stderr.write(`ERROR: ${message}\n\n${USAGE}`);
  return 2;
};

class UsageError extends Error {
  override readonly name = "UsageError";
}

const parseBoundedInt = (
  flag: string,
  raw: string,
  min: number,
  max: number,
): number | string => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return `${flag} must be an integer between ${min} and ${max} (got "${raw}")`;
  }
  return value;
};

const renderEvent = (entry: TeamEventEntry): string =>
  `${entry.id}\t${entry.fields.type}\t${entry.fields.agent}\t${entry.fields.summary.replace(/\n/g, " ")}`;

async function runEvents(options: EventsOptions): Promise<number> {
  const project = options.project ?? process.env.CORTEX_PROJECT ?? "openkai";

  const client = new CortexClient({
    baseUrl: options.api,
    project,
    agent: options.agent,
  });

  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());

  try {
    for await (const item of client.streamEvents({
      lastId: options.lastId,
      count: options.count,
      pingSeconds: options.pingSeconds,
      signal: abort.signal,
    })) {
      switch (item.kind) {
        case "connected":
          if (options.verbose) {
            process.stderr.write(
              `connected (cursor=${item.cursor || "head"})\n`,
            );
          }
          break;
        case "event":
          process.stdout.write(`${renderEvent(item.entry)}\n`);
          break;
        case "ping":
          if (options.keepalive) {
            process.stdout.write(`: ${item.comment}\n`);
          }
          break;
        case "stream-error":
          process.stderr.write(`stream-error: ${item.message}\n`);
          break;
        case "retrying":
          process.stderr.write(
            `reconnecting in ${item.delayMs}ms (attempt ${item.attempt}): ${item.reason}\n`,
          );
          break;
      }
    }
    return 0;
  } catch (error) {
    if (abort.signal.aborted) return 0;
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (
    command === "--help" ||
    command === "-h" ||
    (command === "help" && rest.length === 0)
  ) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`openkai ${CLI_VERSION}\n`);
    return 0;
  }

  // ── help [topic] ─────────────────────────────────────────────────────────
  if (command === "help") {
    const topic = rest[0];
    if (!topic) {
      process.stdout.write(`${helpIndex().join("\n")}\n`);
      return 0;
    }
    const found = helpTopic(topic);
    if (!found) {
      process.stderr.write(`no help topic "${topic}"\n\n${helpIndex().join("\n")}\n`);
      return 2;
    }
    process.stdout.write(`${found.title}\n\n${found.lines.join("\n")}\n\nsee also: ${found.seeAlso.join(", ")}\n`);
    return 0;
  }

  // Bare `openkai` launches the TUI — with or without flags (scope §4.1).
  // `openkai --provider nvidia` is a launch, not a command.
  if (command === undefined || command.startsWith("--")) {
    return runTui(buildTuiOptions(command === undefined ? rest : argv));
  }

  // ── Shared flag parser helpers ─────────────────────────────────────────
  const flags: Record<string, string | boolean | undefined> = {};
  let positional: string[] = [];

  try {
    for (let index = 0; index < rest.length; index += 1) {
      const flag = rest[index];
      const value = (): string => {
        const raw = rest[(index += 1)];
        if (raw === undefined) {
          throw new UsageError(`${flag} requires a value`);
        }
        return raw;
      };
      switch (flag) {
        case "--help":
        case "-h":
          process.stdout.write(USAGE);
          return 0;
        default:
          if (flag?.startsWith("--")) {
            if (index + 1 < rest.length && !rest[index + 1]?.startsWith("--")) {
              flags[flag] = value();
            } else {
              flags[flag] = true;
            }
          } else {
            positional.push(flag!);
          }
      }
    }
  } catch (error) {
    if (error instanceof UsageError) return fail(error.message);
    throw error;
  }

  const getString = (name: string): string | undefined =>
    typeof flags[name] === "string" ? (flags[name] as string) : undefined;

  const getBool = (name: string): boolean => flags[name] === true;

  // ── tui (P4) ────────────────────────────────────────────────────────────
  if (command === "tui") {
    return runTui(buildTuiOptions(rest, flags));
  }

  // ── chat ─────────────────────────────────────────────────────────────────
  if (command === "chat") {
    const prompt = getString("--prompt");
    if (!prompt) {
      return fail("chat requires --prompt <text>.");
    }
    const options: ChatOptions = {
      prompt,
      model: getString("--model"),
      provider: getString("--provider"),
      systemPrompt: getString("--system-prompt"),
      project: getString("--project"),
      api: getString("--api"),
      agent: getString("--agent"),
      quiet: getBool("--quiet"),
    };
    const result = await runChat(options);
    if (result.exitCode === 0 && !options.quiet) {
      process.stderr.write(`\n[openkai] session ${result.sessionId} done\n`);
    }
    return result.exitCode;
  }

  // ── sessions ──────────────────────────────────────────────────────────────
  if (command === "sessions") {
    const options: SessionsOptions = {
      show: getString("--show"),
      search: getString("--search"),
    };
    return runSessions(options);
  }

  // ── fuse (P3) ────────────────────────────────────────────────────────────
  if (command === "fuse") {
    const prompt = getString("--prompt");
    if (!prompt) {
      return fail("fuse requires --prompt <text>.");
    }
    const options: FuseCliOptions = {
      prompt,
      architectModel: getString("--architect-model"),
      builderModel: getString("--builder-model"),
      judgeModel: getString("--judge-model"),
      provider: getString("--provider"),
      cast: getString("--cast"),
      gate: getBool("--gate"),
      yes: getBool("--yes"),
      project: getString("--project") ?? process.env.CORTEX_PROJECT,
      api: getString("--api"),
      agent: getString("--agent"),
      quiet: getBool("--quiet"),
    };
    const roundsRaw = getString("--max-rounds");
    if (roundsRaw) {
      const parsed = parseBoundedInt("--max-rounds", roundsRaw, 1, 10);
      if (typeof parsed === "string") return fail(parsed);
      options.maxRounds = parsed;
    }
    return runFuse(options);
  }

  // ── fusion report / advise (P3b) ─────────────────────────────────────────
  if (command === "fusion") {
    const sub = positional[0];
    if (sub === "report") {
      const lastRaw = getString("--last");
      let last: number | undefined;
      if (lastRaw) {
        const parsed = parseBoundedInt("--last", lastRaw, 1, 10000);
        if (typeof parsed === "string") return fail(parsed);
        last = parsed;
      }
      return runFusionReport({ last });
    }
    if (sub === "advise") {
      const breadthRaw = getString("--files");
      let filesBreadth: number | undefined;
      if (breadthRaw) {
        const parsed = parseBoundedInt("--files", breadthRaw, 0, 100000);
        if (typeof parsed === "string") return fail(parsed);
        filesBreadth = parsed;
      }
      return runFusionAdvise({
        priority: getString("--priority"),
        taskClass: getString("--class"),
        filesBreadth,
      });
    }
    if (sub === "dashboard") {
      const records = await readFusionRuns();
      for (const line of renderFusionDashboard(aggregateFusionRuns(records))) {
        process.stdout.write(line + "\n");
      }
      return 0;
    }
    if (sub === "calibrate") {
      return runFusionCalibrate({
        runs: getString("--runs"),
        baseline: getString("--baseline"),
        provider: getString("--provider"),
        judgeModel: getString("--judge-model"),
        cheapModel: getString("--cheap-model"),
        dearModel: getString("--dear-model"),
        recordDir: getString("--record-dir"),
      });
    }
    return fail("fusion requires a subcommand: report | advise | dashboard | calibrate.");
  }

  // ── undo (Inc 05) ────────────────────────────────────────────────────────
  if (command === "undo") {
    return runUndo({ history: getBool("--history") });
  }

  // ── tail: live activity feed ─────────────────────────────────────────────
  if (command === "tail") {
    let lines = 30;
    const linesRaw = getString("--lines") ?? getString("-n");
    if (linesRaw) {
      const parsed = parseBoundedInt("--lines", linesRaw, 1, 5000);
      if (typeof parsed === "string") return fail(parsed);
      lines = parsed;
    }
    return runTail({ follow: getBool("--follow") || getBool("-f"), lines });
  }

  // ── splash: replay the brand animation on demand ─────────────────────────
  if (command === "serve") {
    const { runHub } = await import("./hub.js");
    const portRaw = getString("--port") ?? "8787";
    const parsed = parseBoundedInt("--port", portRaw, 1, 65535);
    if (typeof parsed === "string") return fail(parsed);
    return runHub({ port: parsed, host: getString("--host") });
  }

  // ── bridge: a chat connector relaying pipe lines into the hub ───────────
  if (command === "bridge") {
    const token = process.env.OPENKAI_HUB_TOKEN;
    if (!token) return fail("bridge requires OPENKAI_HUB_TOKEN.");
    // Same bounded parse as `serve` — an unchecked --port value can smuggle
    // userinfo/path text into the request URL below.
    const portRaw = getString("--port") ?? "8787";
    const parsed = parseBoundedInt("--port", portRaw, 1, 65535);
    if (typeof parsed === "string") return fail(parsed);
    const port = parsed;
    // The hub the bridge relays to (loopback only; --hub-host for an
    // IPv6-bound hub — K3: the hardcoded 127.0.0.1 502'd against ::1 hubs).
    const hubHostRaw = getString("--hub-host") ?? "127.0.0.1";
    if (!isLoopbackHost(hubHostRaw)) return fail(`bridge --hub-host must be loopback (${hubHostRaw})`);
    const hubBase = `http://${urlHost(hubHostRaw)}:${port}`;
    // --listen: run a loopback webhook receiver (Slack/Telegram payloads)
    // and relay normalised prompts into the hub. The sender must present the
    // hub bearer token, so an open port can never inject prompts. Acks are
    // FAST (Slack retries at 3s) and deliveries deduped by event id — a
    // retry must never spawn a second paid turn (K3).
    if (getBool("--listen")) {
      const tokenHash = bearerDigest(token);
      const listenPortRaw = getString("--listen-port") ?? "8788";
      const listenPort = parseBoundedInt("--listen-port", listenPortRaw, 1, 65535);
      if (typeof listenPort === "string") return fail(listenPort);
      const allowedHosts = allowedHostsFor(listenPort);

      const json = (res: ServerResponse, status: number, body: unknown): void => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      // Delivery dedup: event id → expiry. Small TTL map; Slack retries land
      // within seconds, Telegram edits within minutes.
      const seen = new Map<string, number>();
      const DEDUP_TTL_MS = 15 * 60 * 1000;
      const isDuplicate = (eventId: string | undefined): boolean => {
        if (eventId === undefined) return false;
        const now = Date.now();
        for (const [id, expiry] of seen) {
          if (expiry <= now) seen.delete(id);
        }
        if (seen.has(eventId)) return true;
        seen.set(eventId, now + DEDUP_TTL_MS);
        return false;
      };

      /** Fire-and-forget relay into the hub; failures log to stderr only. */
      const relay = (text: string): void => {
        void fetch(`${hubBase}/prompt`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ text }),
        }).catch((error: unknown) => {
          process.stderr.write(`bridge relay failed: ${error instanceof Error ? error.message : String(error)}\n`);
        });
      };

      const server = createServer(async (req, res) => {
        // DNS-rebinding guard, same as the hub's.
        const reqHost = req.headers.host;
        if (!reqHost || allowedHosts[reqHost] !== true) {
          json(res, 403, { error: "forbidden host — loopback only" });
          return;
        }
        if (req.method === "GET" && req.url === "/health") {
          json(res, 200, { ok: true });
          return;
        }
        if (req.method !== "POST") {
          json(res, 405, { error: "method not allowed" });
          return;
        }
        let rawBody: string;
        try {
          rawBody = await readBody(req);
        } catch (error) {
          if (error instanceof BodyTooLargeError) {
            json(res, 413, { error: "payload too large — body cap is 1 MiB" });
            return;
          }
          json(res, 400, { error: "failed to read request body" });
          return;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          json(res, 400, { error: "invalid JSON body" });
          return;
        }
        const event = classifyConnectorPayload(payload);
        // Slack's handshake arrives WITHOUT the bearer — answer it pre-auth.
        if (event.kind === "challenge") {
          json(res, 200, { challenge: event.challenge });
          return;
        }
        if (!bearerMatches(req.headers.authorization, tokenHash)) {
          json(res, 401, { error: "unauthorized" });
          return;
        }
        if (event.kind === "ignore") {
          json(res, 200, { ok: true, ignored: true });
          return;
        }
        if (isDuplicate(event.eventId)) {
          json(res, 200, { ok: true, deduped: true });
          return;
        }
        // Ack fast; the agent turn runs async. The webhook caller gets the
        // receipt, not the result (results arrive in-channel per connector).
        json(res, 200, { ok: true, relayed: true });
        relay(event.text);
      });
      server.requestTimeout = 30_000;
      await new Promise<void>((resolve) => server.listen(listenPort, "127.0.0.1", resolve));
      process.stderr.write(`openkai bridge listening on http://127.0.0.1:${listenPort} (Slack/Telegram payloads, token-gated, deduped)\n`);
      await new Promise<void>((resolve) => {
        process.once("SIGINT", () => server.close(() => resolve()));
        process.once("SIGTERM", () => server.close(() => resolve()));
      });
      return 0;
    }
    const { createInterface } = await import("node:readline");
    const rl = createInterface({ input: process.stdin });
    rl.on("line", async (line) => {
      const text = line.trim();
      if (!text) return;
      try {
        const res = await fetch(`${hubBase}/prompt`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ text }),
        });
        const body = (await res.json()) as { sessionId?: string; error?: string };
        process.stdout.write(`[${res.status}] ${body.sessionId ?? body.error ?? ""}\n`);
      } catch (error) {
        process.stdout.write(`[bridge error] ${error instanceof Error ? error.message : String(error)}\n`);
      }
    });
    await new Promise<void>((resolve) => rl.on("close", resolve));
    return 0;
  }

  if (command === "splash") {
    const { playBrandAnimation } = await import("./tui/brand.js");
    await playBrandAnimation(CLI_VERSION, undefined, { force: true });
    return 0;
  }

  // ── login: subscription OAuth flows ──────────────────────────────────────
  if (command === "login") {
    const provider = positional[0] ?? getString("--provider");
    if (!provider) {
      return fail("login requires a provider — e.g. openkai login openai-codex");
    }
    return runLogin({ provider });
  }

  // ── provider (provider-config write path, consult Q1) ──────────────────
  if (command === "provider") {
    return runProvider({
      sub: positional[0],
      args: positional.slice(1),
      key: getString("--key"),
    });
  }

  // ── info (Inc 08) ────────────────────────────────────────────────────────
  if (command === "info") {
    return runInfo({
      project: getString("--project"),
      api: getString("--api"),
    });
  }

  // ── upgrade (Inc 08, ADR OK-8 dual-channel) ───────────────────────────────
  if (command === "upgrade" || command === "update") {
    const options: UpgradeCliOptions = {
      check: getBool("--check"),
      rollback: getBool("--rollback"),
      version: getString("--version"),
      manifestUrl: getString("--manifest-url"),
    };
    const result = await runUpgrade(options);
    if (result.exitCode === 0) {
      process.stdout.write(`${result.message}
`);
    } else {
      process.stderr.write(`${result.message}
`);
    }
    return result.exitCode;
  }

  // ── events (P1, unchanged) ─────────────────────────────────────────────────
  if (command === "events") {
    if (!getBool("--print")) {
      return fail("events requires a mode — pass --print.");
    }
    const options: EventsOptions = {
      lastId: getString("--last-id"),
      count: undefined,
      pingSeconds: undefined,
      project: getString("--project"),
      api: getString("--api"),
      agent: getString("--agent"),
      keepalive: getBool("--keepalive"),
      verbose: getBool("--verbose"),
    };
    const countRaw = getString("--count");
    if (countRaw) {
      const parsed = parseBoundedInt("--count", countRaw, 1, 200);
      if (typeof parsed === "string") return fail(parsed);
      options.count = parsed;
    }
    const pingRaw = getString("--ping");
    if (pingRaw) {
      const parsed = parseBoundedInt("--ping", pingRaw, 1, 60);
      if (typeof parsed === "string") return fail(parsed);
      options.pingSeconds = parsed;
    }
    return runEvents(options);
  }

  // ── skills (Inc 05) ──────────────────────────────────────────────────────
  if (command === "skills") {
    const sub = positional[0] ?? "";
    const project = getString("--project");
    const api = getString("--api");
    const agent = getString("--agent");
    if (sub === "list" || sub === "") {
      return runSkillsList({ project, api, agent });
    }
    if (sub === "add") {
      const source = positional[1];
      if (!source) return fail("skills add requires <path>.");
      return runSkillsAdd({ source, scope: getString("--scope"), project, api, agent });
    }
    if (sub === "remove") {
      const slug = positional[1];
      if (!slug) return fail("skills remove requires <slug>.");
      return runSkillsRemove({ slug, project, api, agent });
    }
    if (sub === "bind") {
      const slug = positional[1];
      if (!slug) return fail("skills bind requires <slug>.");
      const to = getString("--to");
      if (!to) return fail("skills bind requires --to <agent-or-role>.");
      return runSkillsBind({ slug, to, kind: getString("--kind"), project, api, agent });
    }
    return fail("skills requires a subcommand: list | add | remove | bind.");
  }

  // ── mcp (Inc 05) ──────────────────────────────────────────────────────────
  if (command === "mcp") {
    const sub = positional[0] ?? "";
    if (sub === "list" || sub === "") {
      return runMcpList();
    }
    if (sub === "add") {
      const name = positional[1];
      if (!name) return fail("mcp add requires <name>.");
      return runMcpAdd({
        name,
        command: getString("--command"),
        args: getString("--args"),
        url: getString("--url"),
        env: getString("--env"),
      });
    }
    if (sub === "remove") {
      const name = positional[1];
      if (!name) return fail("mcp remove requires <name>.");
      return runMcpRemove({ name });
    }
    if (sub === "test") {
      const name = positional[1];
      if (!name) return fail("mcp test requires <name>.");
      return runMcpTest({ name });
    }
    return fail("mcp requires a subcommand: list | add | remove | test.");
  }

  // ── statusline (Inc 05) ───────────────────────────────────────────────────
  if (command === "statusline") {
    return runStatusline({
      set: getString("--set"),
      hide: getString("--hide"),
      show: getString("--show"),
      reset: getBool("--reset"),
    });
  }

  return fail(`unknown command "${command}".`);
}


/** Build RunTuiOptions from parsed argv (supports both bare-launch and `tui` subcommand). */
function buildTuiOptions(rest: string[], preFlags?: Record<string, string | boolean | undefined>): RunTuiOptions {
  const flags: Record<string, string | boolean | undefined> = { ...preFlags };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (!flag?.startsWith("--")) continue;
    if (i + 1 < rest.length && !rest[i + 1]?.startsWith("--")) {
      flags[flag] = rest[(i += 1)];
    } else {
      flags[flag] = true;
    }
  }
  const getString = (name: string): string | undefined =>
    typeof flags[name] === "string" ? (flags[name] as string) : undefined;
  const getBool = (name: string): boolean => flags[name] === true;
  return {
    model: getString("--model"),
    provider: getString("--provider"),
    session: getString("--session"),
    systemPrompt: getString("--system-prompt"),
    project: getString("--project"),
    api: getString("--api"),
    agent: getString("--agent"),
    quiet: getBool("--quiet"),
  };
}

// A pipe closing early (e.g. `| head`) is a clean exit, not a crash.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

// Top-level boundary: a crash is an ERROR line and exit 1, never a stack
// dump — unless OPENKAI_DEBUG asks for it.
try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ERROR: ${message}\n`);
  if (process.env.OPENKAI_DEBUG && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 1;
}