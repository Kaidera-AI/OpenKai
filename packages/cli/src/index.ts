#!/usr/bin/env node
/**
 * openkai — operator CLI for the OpenKai harness.
 *
 * P1 scope (ADR §6): the read-only observer surface — `openkai events
 * --print` streams the project's live Cortex team_events into the terminal,
 * proving the @openkai/core SSE bridge end-to-end. The TUI lands on this
 * client in later phases.
 */

import { CortexClient } from "@openkai/core";
import type { TeamEventEntry } from "@openkai/core";

const USAGE = `openkai — OpenKai operator CLI

Usage:
  openkai events --print [options]

Commands:
  events --print        Stream live Cortex team events (GET /events SSE) to
                        stdout, one TSV row per event:
                        id <TAB> type <TAB> agent <TAB> summary

Options:
  --last-id <id>        Resume after a team_events id (default: stream head —
                        only events newer than connect time are printed).
  --count <n>           Events fetched per server read, 1-200 (default 50).
  --ping <seconds>      Server keep-alive cadence, 1-60 (default 15).
  --project <key>       Cortex project (default: $CORTEX_PROJECT).
  --api <url>           Cortex API base URL
                        (default: $CORTEX_API_URL or http://localhost:8501).
  --agent <name>        Send X-Agent-Name with requests.
  --keepalive           Also print ': ping' keep-alive ticks.
  --verbose             Print connect/retry diagnostics to stderr.
  -h, --help            Show this help.
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
  const project = options.project ?? process.env.CORTEX_PROJECT;
  if (!project) {
    return fail(
      "no Cortex project — pass --project or export CORTEX_PROJECT.",
    );
  }

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
    command === undefined ||
    command === "--help" ||
    command === "-h" ||
    command === "help"
  ) {
    process.stdout.write(USAGE);
    return command === undefined ? 2 : 0;
  }

  if (command !== "events") {
    return fail(`unknown command "${command}".`);
  }

  const options: EventsOptions = { keepalive: false, verbose: false };
  let print = false;

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
        case "--print":
          print = true;
          break;
        case "--last-id":
          options.lastId = value();
          break;
        case "--count": {
          const parsed = parseBoundedInt("--count", value(), 1, 200);
          if (typeof parsed === "string") return fail(parsed);
          options.count = parsed;
          break;
        }
        case "--ping": {
          const parsed = parseBoundedInt("--ping", value(), 1, 60);
          if (typeof parsed === "string") return fail(parsed);
          options.pingSeconds = parsed;
          break;
        }
        case "--project":
          options.project = value();
          break;
        case "--api":
          options.api = value();
          break;
        case "--agent":
          options.agent = value();
          break;
        case "--keepalive":
          options.keepalive = true;
          break;
        case "--verbose":
          options.verbose = true;
          break;
        case "--help":
        case "-h":
          process.stdout.write(USAGE);
          return 0;
        default:
          return fail(`unknown option "${flag}".`);
      }
    }
  } catch (error) {
    if (error instanceof UsageError) return fail(error.message);
    throw error;
  }

  if (!print) {
    return fail("events requires a mode — pass --print.");
  }

  return runEvents(options);
}

class UsageError extends Error {
  override readonly name = "UsageError";
}

// A pipe closing early (e.g. `| head`) is a clean exit, not a crash.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

process.exitCode = await main(process.argv.slice(2));
