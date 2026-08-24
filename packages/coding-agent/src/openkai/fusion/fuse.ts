/**
 * The fusion orchestration: gate design (FU-3, when asked) → panel (FU-1) →
 * synthesis (FU-2) → gate evaluation → telemetry (FU-5 shape). One `fuse`
 * call = one task fused.
 */

import type { Api, Model, StreamFunction } from "@oh-my-pi/pi-ai";
import { contentText, newRunId } from "./helpers.js";

import { complete } from "./complete.js";
import {
  designGate,
  gateListing,
  parseGateDesign,
  runGatedFusion,
  verbatimFailures,
} from "./gate.js";
import { runPanel } from "./panel.js";
import { resolveSynthesiser, runSynthesis } from "./synthesis.js";
import type {
  FusionRunRecord,
  GateCheck,
  GateRun,
  RoleOutput,
  SynthesisArtifact,
} from "./types.js";
import { GateHaltError, UnwinnableGateError, WeakGateError } from "./types.js";

export interface FuseOptions {
  task: string;
  architectModel: Model<Api>;
  builderModel: Model<Api>;
  /** Synthesis + gate-validator model (defaults to the architect model). */
  judgeModel?: Model<Api>;
  /** Wrap the run in the FU-3 gate. */
  gate?: boolean;
  /**
   * Operator consent for the designed gate (E001 §2, cole's re-review): the
   * checks are MODEL-AUTHORED shell, run with operator privileges. Called
   * with the designed checks before any execution; a false return refuses
   * the gate (outcome "refused") and nothing runs.
   *
   * **Required whenever `gate` is true.** Absent is a REFUSAL, not consent
   * (E001 finding F9): a caller that designs a gate but wires no consent
   * channel cannot silently run model-authored shell.
   */
  approveGate?: (checks: GateCheck[]) => boolean | Promise<boolean>;
  /**
   * Materialise the builder's current output into the workspace between gate
   * rounds. **Required when `gate` is true**: without it the baseline RED
   * state can never change, the gate is unwinnable, and {@link fuse} throws
   * {@link UnwinnableGateError} at entry rather than burn panel/synthesis
   * tokens on a run that can only halt.
   */
  applyWork?: (builderText: string) => void;
  cwd?: string;
  maxRounds?: number;
}

export interface FuseResult {
  runId: string;
  outputs: RoleOutput[];
  synthesis: SynthesisArtifact;
  gate: FusionRunRecord["gate"];
  gateRuns: GateRun[];
  record: FusionRunRecord;
}

/**
 * Run one fusion. A gated run REQUIRES `applyWork`: completion-only roles
 * cannot change the workspace, so without a materialisation path the
 * baseline RED state can never flip and the gate is unwinnable — fuse()
 * throws {@link UnwinnableGateError} at entry, before the validator, panel,
 * or synthesis burn a single token.
 */
export async function fuse(
  streamFn: StreamFunction<Api>,
  options: FuseOptions,
): Promise<FuseResult> {
  const started = Date.now();
  // OK-9 W4: the judge (synthesis + gate validation) is the strongest
  // available model, never a panel member when a distinct judge exists.
  const judge = resolveSynthesiser(options);
  const cwd = options.cwd ?? process.cwd();
  const gated = options.gate === true;
  const gateRuns: GateRun[] = [];

  // Unwinnable configurations fail fast at entry: no applyWork means the
  // gate's RED baseline can never be turned green, so every gated run would
  // end in a halt after burning panel + synthesis tokens for nothing.
  if (gated && !options.applyWork) {
    throw new UnwinnableGateError(
      "gate: true requires applyWork — without a way to materialise the " +
        "builder's output the baseline RED state can never change, so the " +
        "gate is unwinnable. Refusing before burning panel/synthesis tokens.",
    );
  }

  // FU-3 step 1: the validator designs the gate before any work.
  const checks = gated
    ? await designGate(streamFn, judge, options.task)
    : undefined;

  // Consent parity with the bash tool (E001 §2): model-authored checks do
  // not execute without operator approval. No consent channel = refusal —
  // fail-closed, because the fail-open form made an omitted callback grant
  // consent on the caller's behalf (E001 finding F9).
  if (checks) {
    const approved = options.approveGate ? await options.approveGate(checks) : false;
    if (!approved) {
      const record: FusionRunRecord = {
        runId: newRunId(),
        ts: new Date().toISOString(),
        task: options.task,
        gated,
        roles: [],
        synthesis: undefined,
        gate: { rounds: 0, outcome: "refused" },
        wallMs: Date.now() - started,
      };
      return {
        runId: record.runId,
        outputs: [],
        synthesis: {
          consensus: [],
          divergences: [],
          discarded: [],
          blindSpots: [],
          raw: "",
          modelId: judge.id,
          usage: undefined,
        },
        gate: { rounds: 0, outcome: "refused" },
        gateRuns: [],
        record,
      };
    }
  }

  // FU-1: the panel, with the immutable gate visible when gated (step 3).
  const outputs = await runPanel(streamFn, {
    task: options.task,
    architectModel: options.architectModel,
    builderModel: options.builderModel,
    sharedContext: checks ? gateListing(checks) : undefined,
  });

  // Partial panel: a failed role is recorded with its error, and the
  // surviving role's output is returned — not thrown away. A merge over one
  // position would be a silent regression to one opinion (the AttributionError
  // class of defect), so synthesis and the gate do not run on a broken panel.
  if (outputs.some((o) => o.error !== undefined)) {
    const record: FusionRunRecord = {
      runId: newRunId(),
      ts: new Date().toISOString(),
      task: options.task,
      gated,
      roles: outputs,
      synthesis: undefined,
      gate: { rounds: 0, outcome: "not-run" },
      wallMs: Date.now() - started,
    };
    return {
      runId: record.runId,
      outputs,
      synthesis: {
        consensus: [],
        divergences: [],
        discarded: [],
        blindSpots: [],
        raw: "",
        modelId: judge.id,
        usage: undefined,
      },
      gate: { rounds: 0, outcome: "not-run" },
      gateRuns: [],
      record,
    };
  }

  // FU-2: the attributed merge from a fresh third session.
  const synthesis = await runSynthesis(streamFn, judge, options.task, outputs);

  // FU-3 steps 2–6 (baseline RED + evaluation; builder repair rounds are
  // fresh builder sessions fed verbatim failures). A FAILED synthesis never
  // gates (OK-9 W4): the merge is the audit record the verdict attaches to,
  // and gating a verbatim fallback would hide a broken merge behind a green
  // check — the record stays honest as "not-run".
  let gate: FusionRunRecord["gate"] = { rounds: 0, outcome: "not-run" };
  if (checks && synthesis.synthesisError === undefined) {
    const builderOutput =
      outputs.find((o) => o.role === "builder")?.text ?? "";
    try {
      const { runs } = await runGatedFusion({
        checks,
        cwd,
        maxRounds: options.maxRounds,
        initialWork: builderOutput,
        applyWork: options.applyWork,
        approveGate: options.approveGate,
        repairWork: (failures) =>
          complete(streamFn, options.builderModel, {
            system:
              "You are the BUILDER role in a fusion run. Your previous " +
              "deliverable failed the acceptance gate. Repair the deliverable " +
              "against the verbatim gate failures below. The gate is immutable.",
            prompt:
              `TASK:\n${options.task}\n\nPREVIOUS DELIVERABLE:\n${builderOutput}\n\n` +
              `GATE FAILURES (verbatim):\n${failures}`,
          }).then((r) => r.text),
        repairGate: async (defective) => {
          const repaired = await complete(streamFn, judge, {
            system:
              "You are the GATE VALIDATOR. A gate check is defective (its " +
              "command does not exist). Repair the gate: same requirements, " +
              "working commands only. Never weaken a legitimate check. Output " +
              "ONLY the repaired JSON array.",
            prompt: `TASK:\n${options.task}\n\nDEFECTIVE RUN:\n${verbatimFailures(defective)}`,
          });
          // Re-design through the same strict parser as designGate.
          return parseGateDesign(repaired.text);
        },
      });
      gateRuns.push(...runs);
      gate = {
        rounds: runs.filter((r) => r.purpose === "evaluation").length,
        outcome: "pass",
      };
    } catch (error) {
      if (error instanceof WeakGateError) {
        gate = { rounds: 0, outcome: "weak-gate" };
        gateRuns.push(...error.runs);
      } else if (error instanceof GateHaltError) {
        gate = {
          rounds: error.runs.filter((r) => r.purpose === "evaluation").length,
          outcome: "halt",
        };
        gateRuns.push(...error.runs);
      } else {
        throw error;
      }
    }
  }

  const record: FusionRunRecord = {
    runId: newRunId(),
    ts: new Date().toISOString(),
    task: options.task,
    gated,
    roles: outputs,
    synthesis: { modelId: synthesis.modelId, usage: synthesis.usage },
    gate,
    wallMs: Date.now() - started,
  };

  return { runId: record.runId, outputs, synthesis, gate, gateRuns, record };
}