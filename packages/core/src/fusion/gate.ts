/**
 * FU-3 — gate-first auto-validation. Supersedes E015 KL-1.
 *
 * The loop, in full (E016 §3.2):
 *   1. The VALIDATOR designs the gate before any work, read-only: every
 *      explicit requirement maps to one executable check.
 *   2. The baseline run MUST fail RED. An all-green baseline means the gate
 *      is weak or the work already done — {@link WeakGateError}, loudly.
 *   3. The gate is visible to the builder but IMMUTABLE during a run.
 *   4. FAIL output feeds back VERBATIM.
 *   5. Escalate at the cap (default 3). Gate repair is allowed ONCE per run
 *      when the gate itself is defective; the old gate is preserved in the
 *      run history and the repair does not consume a builder round.
 *   6. Loud halt at the cap — {@link GateHaltError} carries every run.
 *
 * Invariant: the builder never grades its own homework. Checks execute here,
 * outside every role session; roles only ever see the gate as text.
 *
 * Boundary honesty (scope §5): checks are arbitrary shell run with the
 * operator's privileges — this is validation, not a sandbox. Completion-only
 * roles cannot change the workspace, so the CLI wires no `applyWork`; the
 * full repair loop is exercised in tests with a synthetic applier and goes
 * live with Inc 05's permission-gated write tools.
 */

import { spawnSync } from "node:child_process";

import type { Api, Model, StreamFunction } from "@earendil-works/pi-ai";
import { complete } from "./complete.js";
import type { GateCheck, GateCheckResult, GateRun } from "./types.js";
import { GateHaltError, WeakGateError } from "./types.js";

/**
 * Secret-shaped env-var patterns to scrub from child processes (F9 DiD).
 * Matches the §1 secret-scan prefixes: any value beginning with these is a
 * credential and must not inherit into model-authored shell.
 */
const SECRET_ENV_VALUE_PATTERNS: readonly RegExp[] = [
  /^sk-/,
  /^nvapi-/,
  /^fw_/,
  /^AIza/,
  /^ghp_/,
  /^xai-/,
];

/**
 * Env vars scrubbed by NAME regardless of value (F9 DiD). These are known
 * credential variables the CLI loads from `.env`.
 */
const SECRET_ENV_NAMES: ReadonlySet<string> = new Set([
  "OPENROUTER_API_KEY",
]);

/**
 * Build a child environment with secret-shaped variables scrubbed (F9 DiD).
 * Gate checks are MODEL-AUTHORED shell run with operator privileges; the
 * child must not inherit credentials the CLI loaded from `.env`.
 */
function scrubbedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { CI: "1" };
  for (const [key, value] of Object.entries(process.env)) {
    if (SECRET_ENV_NAMES.has(key)) continue;
    if (
      typeof value === "string" &&
      SECRET_ENV_VALUE_PATTERNS.some((p) => p.test(value))
    ) {
      continue;
    }
    env[key] = value;
  }
  return env;
}

const VALIDATOR_SYSTEM =
  "You are the GATE VALIDATOR in a fusion run. Read the task and design the " +
  "acceptance gate BEFORE any work happens: map every explicit requirement " +
  "in the task to one executable check. Each check is a shell command run in " +
  "the workspace that exits 0 when the requirement is met. Prefer existing " +
  "project tooling (test runner, typecheck, lint, grep for required output). " +
  "Read-only: design checks, never perform the work. Output ONLY a JSON " +
  'array: [{"name": string, "command": string, "expectExit": number?}] — ' +
  "at most 8 checks, each command a single line.";

const isGateCheck = (value: unknown): value is GateCheck => {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c["name"] === "string" &&
    c["name"].length > 0 &&
    typeof c["command"] === "string" &&
    c["command"].length > 0 &&
    !c["command"].includes("\n") &&
    (c["expectExit"] === undefined || typeof c["expectExit"] === "number")
  );
};

/** Extract the first balanced JSON array from validator output. */
function extractJsonArray(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("[");
  if (start === -1) throw new Error("gate design contained no JSON array");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
    } else if (ch === "\\" && inString) {
      escaped = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === "[") depth += 1;
      if (ch === "]") {
        depth -= 1;
        if (depth === 0) return candidate.slice(start, i + 1);
      }
    }
  }
  throw new Error("gate design JSON array was unbalanced");
}

/** Parse and validate a validator's gate design (strict; shared by repair). */
export function parseGateDesign(raw: string): GateCheck[] {
  const parsed: unknown = JSON.parse(extractJsonArray(raw));
  const list = Array.isArray(parsed) ? parsed : [];
  const checks = list.slice(0, 8).map((item) => {
    if (!isGateCheck(item)) {
      throw new Error(
        `validator emitted a malformed check: ${JSON.stringify(item).slice(0, 160)}`,
      );
    }
    return item;
  });
  if (checks.length === 0) {
    throw new Error("validator designed an empty gate");
  }
  return checks;
}

/** FU-3 step 1: the validator designs the gate before any work, read-only. */
export async function designGate(
  streamFn: StreamFunction,
  validatorModel: Model<Api>,
  task: string,
): Promise<GateCheck[]> {
  const result = await complete(streamFn, validatorModel, {
    system: VALIDATOR_SYSTEM,
    prompt: `TASK:\n${task}`,
  });
  return parseGateDesign(result.text);
}

export interface RunGateOptions {
  cwd: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}

/** Execute every check; pass = ALL checks exit as expected. */
export function runGate(
  checks: GateCheck[],
  purpose: GateRun["purpose"],
  options: RunGateOptions,
): GateRun {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputChars = options.maxOutputChars ?? 4_000;
  const results: GateCheckResult[] = checks.map((check) => {
    const proc = spawnSync(check.command, {
      shell: true,
      cwd: options.cwd,
      timeout: timeoutMs,
      encoding: "utf-8",
      env: scrubbedEnv(),
    });
    const exitCode =
      typeof proc.status === "number" ? proc.status : proc.error ? 127 : 1;
    const raw = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim();
    return {
      check,
      exitCode,
      output: raw.slice(0, maxOutputChars),
      pass: exitCode === (check.expectExit ?? 0),
    };
  });
  return { purpose, results, pass: results.every((r) => r.pass) };
}

/** Verbatim failing output — FU-3 step 4. No summarising, no paraphrase. */
export function verbatimFailures(run: GateRun): string {
  return run.results
    .filter((r) => !r.pass)
    .map(
      (r) =>
        `FAIL ${r.check.name} (exit ${r.exitCode}, expected ${r.check.expectExit ?? 0})\n` +
        `$ ${r.check.command}\n${r.output || "(no output)"}`,
    )
    .join("\n\n");
}

/** The immutable gate text shown to the builder — FU-3 step 3. */
export function gateListing(checks: GateCheck[]): string {
  const lines = checks.map(
    (c, i) => `${i + 1}. ${c.name}: \`${c.command}\` (expect exit ${c.expectExit ?? 0})`,
  );
  return `ACCEPTANCE GATE (immutable for this run):\n${lines.join("\n")}`;
}

export interface GatedFusionOptions {
  checks: GateCheck[];
  cwd: string;
  maxRounds?: number;
  /**
   * Materialise the builder's current output into the workspace. Absent for
   * completion-only roles: the gate then evaluates once, after the work.
   */
  applyWork?: (builderText: string) => void;
  /** Produce the next builder output given verbatim gate failures. */
  repairWork: (verbatimFailureText: string) => Promise<string>;
  /** Current builder output before any repair round. */
  initialWork: string;
  /**
   * Gate repair (FU-3): called at most once per run when a check is
   * defective (command not found, exit 127). Returns the repaired gate.
   * The defective run stays in history; the repair consumes NO builder round.
   * Weakening a legitimate check is forbidden — the repair callback is the
   * validator, not the builder.
   */
  repairGate?: (defective: GateRun) => Promise<GateCheck[]>;
}

/**
 * FU-3 steps 2–6. With no `applyWork`, evaluates the post-work workspace
 * once (repair is impossible when nothing can change). With `applyWork`,
 * runs the full repair loop: apply → evaluate → verbatim feedback → repair,
 * up to `maxRounds`, then halt loudly.
 */
export async function runGatedFusion(
  options: GatedFusionOptions,
): Promise<{ runs: GateRun[]; finalWork: string }> {
  const maxRounds = options.maxRounds ?? 3;
  const runs: GateRun[] = [];

  // Baseline: MUST fail RED (step 2).
  const baseline = runGate(options.checks, "baseline", { cwd: options.cwd });
  runs.push(baseline);
  if (baseline.pass) {
    throw new WeakGateError(
      "gate baseline is GREEN before any work — the gate is weak or the work is already done. Redesign the gate.",
      runs,
    );
  }

  let work = options.initialWork;
  let checks = options.checks;
  let gateRepairsUsed = 0;

  if (!options.applyWork) {
    // Completion-only roles: nothing can change the workspace mid-run.
    const evaluation = runGate(checks, "evaluation", { cwd: options.cwd });
    runs.push(evaluation);
    if (!evaluation.pass) {
      throw new GateHaltError(
        `gate failed after the work and no applyWork path is wired (completion-only roles).\n\n${verbatimFailures(evaluation)}`,
        runs,
      );
    }
    return { runs, finalWork: work };
  }

  for (let round = 1; round <= maxRounds; round += 1) {
    options.applyWork(work);
    let evaluation = runGate(checks, "evaluation", { cwd: options.cwd });
    runs.push(evaluation);

    // Gate repair: a check whose command does not exist (exit 127) is a
    // defective gate, not failing work. Repair once, re-run without
    // consuming the builder round.
    const defective = evaluation.results.some((r) => r.exitCode === 127);
    if (
      defective &&
      !evaluation.pass &&
      gateRepairsUsed === 0 &&
      options.repairGate
    ) {
      gateRepairsUsed += 1;
      checks = await options.repairGate(evaluation);
      evaluation = runGate(checks, "repair", { cwd: options.cwd });
      runs.push(evaluation);
    }

    if (evaluation.pass) return { runs, finalWork: work };
    if (round === maxRounds) break;
    // Step 4: FAIL output feeds back verbatim.
    work = await options.repairWork(verbatimFailures(evaluation));
  }
  const last = runs[runs.length - 1];
  throw new GateHaltError(
    `gate still failing after ${maxRounds} builder rounds — escalating to triage.\n\n${last ? verbatimFailures(last) : ""}`,
    runs,
  );
}
