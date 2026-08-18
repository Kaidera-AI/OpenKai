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

import { spawn } from "node:child_process";

import type { Api, Model, StreamFunction } from "@earendil-works/pi-ai";
import { scrubbedChildEnv } from "../procenv.js";
import { complete } from "./complete.js";
import type { GateCheck, GateCheckResult, GateRun } from "./types.js";
import { GateHaltError, WeakGateError } from "./types.js";

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

/**
 * The environment handed to a gate check comes from the shared scrubber
 * (../procenv.js): the commands are MODEL-AUTHORED and run unsandboxed, so
 * the operator's credentials are not theirs to inherit — anything whose NAME
 * or VALUE is secret-shaped is dropped (E001 finding F9). SECURITY.md §4
 * keeps secrets in `.env`, and `.env` is loaded into this process — without
 * this scrub one designed check exfiltrates the lot.
 */

/** Execute one check: async spawn, streamed capture, group kill on timeout. */
function runCheck(
  check: GateCheck,
  options: RunGateOptions,
): Promise<GateCheckResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputChars = options.maxOutputChars ?? 4_000;
  const { promise, resolve } = Promise.withResolvers<GateCheckResult>();
  // detached: the shell leads its own process group, so a timeout can kill
  // the WHOLE tree — a check that spawned a `sleep` grandchild would
  // otherwise outlive the kill and hold the workspace.
  const child = spawn(check.command, {
    shell: true,
    cwd: options.cwd,
    detached: true,
    env: scrubbedChildEnv(),
  });
  let output = "";
  let timedOut = false;
  let settled = false;
  const finish = (exitCode: number | null, error?: unknown): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    const detail = error ? `\n${error instanceof Error ? error.message : String(error)}` : "";
    const trimmed = `${output}${detail}`.trim();
    resolve({
      check,
      exitCode,
      timedOut,
      output: trimmed.slice(0, maxOutputChars),
      pass: !timedOut && exitCode === (check.expectExit ?? 0),
    });
  };
  const timer = setTimeout(() => {
    timedOut = true;
    // Negative pid = signal the child's whole process group.
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    } else {
      child.kill("SIGKILL");
    }
    // The `close` event settles the result, carrying the partial output
    // collected before the kill — a hung check stays visible, not silent.
  }, timeoutMs);
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf-8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString("utf-8");
  });
  child.on("error", (error) => finish(null, error));
  child.on("close", (code) => finish(code));
  return promise;
}

/**
 * Execute every check; pass = ALL checks exit as expected. Checks run
 * sequentially (they share one workspace; parallel shells would race).
 * `exitCode` is the shell's genuine status only: a timeout kills the
 * process group and records `timedOut` with a null code — 127 therefore
 * ALWAYS means the shell's own "command not found", which is what the
 * defective-gate repair keys on.
 */
export async function runGate(
  checks: GateCheck[],
  purpose: GateRun["purpose"],
  options: RunGateOptions,
): Promise<GateRun> {
  const results: GateCheckResult[] = [];
  for (const check of checks) {
    results.push(await runCheck(check, options));
  }
  return { purpose, results, pass: results.every((r) => r.pass) };
}

/** Verbatim failing output — FU-3 step 4. No summarising, no paraphrase. */
export function verbatimFailures(run: GateRun): string {
  return run.results
    .filter((r) => !r.pass)
    .map(
      (r) =>
        `FAIL ${r.check.name} (exit ${r.exitCode ?? "none"}${r.timedOut ? ", timed out" : ""}, expected ${r.check.expectExit ?? 0})\n` +
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
  /**
   * Operator consent, the SAME callback that approved the original design.
   * The repaired gate is fresh model-authored shell, so it goes through the
   * identical consent channel before it executes (E001 finding F9 applies to
   * the repair exactly as to the design). Absent or false = refusal, and the
   * run halts rather than execute unconsented checks.
   */
  approveGate?: (checks: GateCheck[]) => boolean | Promise<boolean>;
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
  const baseline = await runGate(options.checks, "baseline", { cwd: options.cwd });
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
    const evaluation = await runGate(checks, "evaluation", { cwd: options.cwd });
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
    let evaluation = await runGate(checks, "evaluation", { cwd: options.cwd });
    runs.push(evaluation);

    // Gate repair: a check whose command does not exist (genuine exit 127 —
    // timeouts are excluded even in the boundary race where a killed shell's
    // code had already arrived) is a defective gate, not failing work.
    // Repair once, re-run without consuming the builder round.
    const defective = evaluation.results.some(
      (r) => r.exitCode === 127 && !r.timedOut,
    );
    if (
      defective &&
      !evaluation.pass &&
      gateRepairsUsed === 0 &&
      options.repairGate
    ) {
      gateRepairsUsed += 1;
      const repaired = await options.repairGate(evaluation);
      // The repaired design is fresh model-authored shell: it passes through
      // the SAME consent channel as the original design before executing.
      const consented = options.approveGate
        ? await options.approveGate(repaired)
        : false;
      if (!consented) {
        throw new GateHaltError(
          "operator refused the repaired gate design — halting rather than running unconsented checks.",
          runs,
        );
      }
      checks = repaired;
      evaluation = await runGate(checks, "repair", { cwd: options.cwd });
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