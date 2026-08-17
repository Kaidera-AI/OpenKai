/**
 * Welcome — the first-run setup (E002 Inc 03). Plays when OpenKai starts
 * without a completed onboarding; re-runnable via `/welcome`.
 *
 * Goals (CTO directive): providers get connected, memory gets chosen, the
 * operator learns the three keys that matter — in under two minutes, without
 * leaving the terminal, without forcing Cortex (ren A1: file memory is the
 * default; Cortex is offered, tested, optional).
 *
 * The flow is a small state machine over plain terminal prompts (before the
 * alt-screen app boots): providers → default model → memory → done. Every
 * answer lands in `~/.openkai/config.json` (+ keys into `~/.openkai/.env`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";

import { PROVIDERS } from "../providers.js";

export interface OpenKaiConfig {
  onboarded?: boolean;
  provider?: string;
  model?: string;
  memory?: "local" | "cortex";
  cortexProject?: string;
  [key: string]: unknown;
}

const configPath = (): string => path.join(homedir(), ".openkai", "config.json");
const envPath = (): string => path.join(homedir(), ".openkai", ".env");

export function readConfig(): OpenKaiConfig {
  try {
    if (!existsSync(configPath())) return {};
    return JSON.parse(readFileSync(configPath(), "utf-8")) as OpenKaiConfig;
  } catch {
    return {};
  }
}

function writeConfig(config: OpenKaiConfig): void {
  mkdirSync(path.dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

/** Onboarding plays when the operator has never completed it. */
export function needsWelcome(): boolean {
  return readConfig().onboarded !== true;
}

const KEY_PROVIDERS: [string, string][] = [
  ["openrouter", "OPENROUTER_API_KEY"],
  ["nvidia", "NVIDIA_API_KEY"],
  ["anthropic", "ANTHROPIC_API_KEY"],
  ["openai", "OPENAI_API_KEY"],
  ["google", "GEMINI_API_KEY"],
  ["deepseek", "DEEPSEEK_API_KEY"],
  ["kimi-coding", "KIMI_API_KEY"],
];

/** The interactive first-run flow. Prompts on stdio; writes config + env. */
export async function runWelcome(): Promise<OpenKaiConfig> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

  try {
    process.stdout.write("\n  Welcome to OpenKai — the open agent harness, by Kaidera.\n");
    process.stdout.write("  First run: connect a provider, pick a model, choose memory. 60 seconds.\n\n");

    // ── 1. Provider keys (two lanes unlock real fusion) ────────────────
    const config = readConfig();
    let configured = 0;
    for (const [id, envVar] of KEY_PROVIDERS) {
      if (process.env[envVar]) {
        configured += 1;
        continue;
      }
      const answer = await ask(`  ${PROVIDERS[id]?.label ?? id} key (${envVar}) [Enter to skip]: `);
      if (answer.length > 0) {
        mkdirSync(path.dirname(envPath()), { recursive: true });
        appendFileSync(envPath(), `${envVar}=${answer}\n`, "utf-8");
        process.env[envVar] = answer;
        configured += 1;
      }
    }
    if (configured === 0) {
      process.stdout.write("  No provider keys set — you can add them later in ~/.openkai/.env\n");
    } else if (configured === 1) {
      process.stdout.write(
        "\n  One provider works, but fusion's real lift needs TWO independent lanes.\n" +
          "  Easiest: one OpenRouter key covers 300+ models as the second lane\n" +
          "  (Fireworks, NVIDIA, Anthropic, OpenAI keys work too). Add one now?\n",
      );
      for (const [id, envVar] of KEY_PROVIDERS) {
        if (process.env[envVar]) continue;
        const answer = await ask(`  ${PROVIDERS[id]?.label ?? id} key (${envVar}) [Enter to skip]: `);
        if (answer.length > 0) {
          appendFileSync(envPath(), `${envVar}=${answer}\n`, "utf-8");
          process.env[envVar] = answer;
          configured += 1;
          break;
        }
      }
    }

    // ── 2. Default provider + model ─────────────────────────────────────
    const providerDefault = process.env.OPENROUTER_API_KEY
      ? "openrouter"
      : process.env.NVIDIA_API_KEY
        ? "nvidia"
        : KEY_PROVIDERS.find(([, envVar]) => process.env[envVar])?.[0] ?? "openrouter";
    const provider = (await ask(`  Default provider [${providerDefault}]: `)) || providerDefault;
    const modelDefault = provider === "nvidia" ? "meta/llama-3.1-8b-instruct" : "nvidia/nemotron-3-nano-30b-a3b:free";
    const model = (await ask(`  Default model [${modelDefault}]: `)) || modelDefault;
    config.provider = provider;
    config.model = model;

    // ── 3. Memory ───────────────────────────────────────────────────────
    process.stdout.write("\n  Memory: (l)ocal file memory in this project folder, or (c)ortex-managed.\n");
    process.stdout.write("  Local works fully offline. For long projects we recommend KOS (it ships\n");
    process.stdout.write("  Cortex): shared searchable memory + smarter context-window handling.\n");
    const memory = ((await ask("  Memory choice [l]: ")) || "l").toLowerCase();
    if (memory.startsWith("c")) {
      const project = await ask("  Cortex project key [openkai]: ");
      config.memory = "cortex";
      config.cortexProject = project || "openkai";
      process.stdout.write(`  Cortex will be probed at startup; unreachable ⇒ local mode (never a crash).\n`);
    } else {
      config.memory = "local";
      process.stdout.write("  Local memory: sessions live in .openkai/sessions/ — yours, deletable.\n");
    }

    // ── 4. Done ─────────────────────────────────────────────────────────
    config.onboarded = true;
    writeConfig(config);
    process.stdout.write(
      "\n  You're set. Three keys:  /  commands · Ctrl+K palette · Enter approves prompts.\n" +
        "  Try fusion: /fuse <task> — two minds, one attributed answer.\n\n",
    );
    return config;
  } finally {
    rl.close();
  }
}
