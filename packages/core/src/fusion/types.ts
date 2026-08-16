/**
 * Fusion core types (E016 FU-1/FU-2/FU-3, scope: research/2026-08-15-p3-fusion-scope.md).
 *
 * Invariants enforced by the implementations (not by convention):
 * separate fresh contexts per role; mandatory [ARCHITECT]/[BUILDER]
 * attribution in the merge; gate baseline must fail RED; loud halt at the
 * retry cap; the builder never grades its own homework.
 */

import type { Usage } from "@earendil-works/pi-ai";

/** The two FU-1 roles. Self-pairing = same model for both (the default). */
export type FusionRole = "architect" | "builder";

/** One role's settled output. */
export interface RoleOutput {
  role: FusionRole;
  modelId: string;
  text: string;
  usage: Usage | undefined;
  latencyMs: number;
}

/** A kept disagreement, with both positions attributed. */
export interface SynthesisDivergence {
  topic: string;
  architect: string;
  builder: string;
  /** Which position was kept, or "both" when the divergence is recorded. */
  kept: "architect" | "builder" | "both";
}

/** A discarded position and the reason, with attribution. */
export interface SynthesisDiscard {
  item: string;
  reason: string;
  by: "architect" | "builder";
}

/**
 * The FU-2 merge artifact. First-class, stored, attributed — the audit
 * record of WHY a decision was made, and the future input to FU-5.
 */
export interface SynthesisArtifact {
  consensus: string[];
  divergences: SynthesisDivergence[];
  discarded: SynthesisDiscard[];
  blindSpots: string[];
  /** Raw model output, kept for audit even after successful parse. */
  raw: string;
  modelId: string;
  usage: Usage | undefined;
}

/** One executable gate check, designed by the validator before any work. */
export interface GateCheck {
  name: string;
  /** Shell command, run in the workspace cwd with a timeout. */
  command: string;
  /** Expected exit code (default 0). */
  expectExit?: number;
}

/** The outcome of executing one check. */
export interface GateCheckResult {
  check: GateCheck;
  exitCode: number;
  output: string;
  pass: boolean;
}

/** One full gate execution (baseline or evaluation round). */
export interface GateRun {
  purpose: "baseline" | "evaluation" | "repair";
  results: GateCheckResult[];
  pass: boolean;
}

/** FU-5-shaped telemetry for one fusion run. */
export interface FusionRunRecord {
  runId: string;
  ts: string;
  task: string;
  gated: boolean;
  roles: RoleOutput[];
  synthesis: Pick<SynthesisArtifact, "modelId" | "usage"> | undefined;
  gate: { rounds: number; outcome: "pass" | "halt" | "weak-gate" | "not-run" | "refused" };
  wallMs: number;
}

/** Thrown when the merge drops attribution (E016: regression to one opinion). */
export class AttributionError extends Error {
  override readonly name = "AttributionError";
}

/** Thrown when a baseline gate run is all-green (the gate proves nothing). */
export class WeakGateError extends Error {
  override readonly name = "WeakGateError";
  readonly runs: GateRun[];
  constructor(message: string, runs: GateRun[]) {
    super(message);
    this.runs = runs;
  }
}

/** Thrown at the retry cap — loud halt, no silent loops. */
export class GateHaltError extends Error {
  override readonly name = "GateHaltError";
  readonly runs: GateRun[];
  constructor(message: string, runs: GateRun[]) {
    super(message);
    this.runs = runs;
  }
}
