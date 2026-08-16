/**
 * The fusion orchestration: gate design (FU-3, when asked) → panel (FU-1) →
 * synthesis (FU-2) → gate evaluation → telemetry (FU-5 shape). One `fuse`
 * call = one task fused.
 */

import type { Api, Model, StreamFunction } from "@earendil-works/pi-ai";
import { uuidv7 } from "@earendil-works/pi-ai";

import { complete } from "./complete.js";
import {
  designGate,
  gateListing,
  parseGateDesign,
  runGatedFusion,
  verbatimFailures,
} from "./gate.js";
import { runPanel } from "./panel.js";
import { runSynthesis } from "./synthesis.js";
import type {
  FusionRunRecord,
  GateCheck,
  GateRun,
  RoleOutput,
  SynthesisArtifact,
} from "./types.js";
import { GateHaltError, WeakGateError } from "./types.js";

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
 * Run one fusion. Completion-only roles cannot change the workspace, so the
 * gate's baseline RED check and its evaluation run on the same tree state —
 * the RED check still catches weak gates (a green gate proves nothing), and
 * the evaluation is the verdict on the workspace as it stands. The live
 * repair loop (applyWork) wires in with Inc 05's permission-gated tools.
 */
export async function fuse(
  streamFn: StreamFunction,
  options: FuseOptions,
): Promise<FuseResult> {
  const started = Date.now();
  const judge = options.judgeModel ?? options.architectModel;
  const cwd = options.cwd ?? process.cwd();
  const gated = options.gate === true;
  const gateRuns: GateRun[] = [];

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
        runId: uuidv7(),
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

  // FU-2: the attributed merge from a fresh third session.
  const synthesis = await runSynthesis(streamFn, judge, options.task, outputs);

  // FU-3 steps 2–6 (baseline RED + evaluation; builder repair rounds are
  // fresh builder sessions fed verbatim failures).
  let gate: FusionRunRecord["gate"] = { rounds: 0, outcome: "not-run" };
  if (checks) {
    const builderOutput =
      outputs.find((o) => o.role === "builder")?.text ?? "";
    try {
      const { runs } = await runGatedFusion({
        checks,
        cwd,
        maxRounds: options.maxRounds,
        initialWork: builderOutput,
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
    runId: uuidv7(),
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