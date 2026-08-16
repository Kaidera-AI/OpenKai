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
import { DEFAULT_MODEL_ID } from "@kaidera/openkai-core";
import { runChat, type ChatOptions } from "./chat.js";
import { loadDotEnv } from "./env.js";
import { runFuse, type FuseCliOptions } from "./fuse.js";
import { runFusionAdvise, runFusionReport } from "./fusion.js";
import { runInfo } from "./info.js";
import { runTui, type RunTuiOptions } from "./tui/runtime.js";
import { runSessions, type SessionsOptions } from "./sessions.js";
import { runTail } from "./tail.js";
import { runUndo } from "./undo.js";
import { CLI_VERSION } from "./version.js";

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

  undo [--history]       Restore the work tree to the previous shadow-git
                         snapshot (taken before every gated mutation);
                         --history lists snapshots newest-first.

  tail [-f] [-n N]       Live activity feed: turn starts, tool calls, results,
                         tokens — what the agent is doing right now
                         (.openkai/activity.jsonl). -f follows like tail -f.

  info                   Self-check: version, run mode (standalone-local /
                         KOS-managed), Cortex reachability, model catalogue,
                         local state counts. Always exits 0.

  upgrade | update       Self-upgrade (standalone channel; rollback with
                         --rollback, check only with --check).

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
    command === "help"
  ) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`openkai ${CLI_VERSION}\n`);
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
    return fail("fusion requires a subcommand: report | advise.");
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

process.exitCode = await main(process.argv.slice(2));