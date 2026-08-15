/**
 * P3 fusion core tests (scope §4). Deterministic + offline: every model call
 * is a scripted faux-provider response; gate checks are safe shell one-liners
 * (`true`, `false`, `test -f`) run inside a `node:fs.mkdtemp` temp dir.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createModels } from "@earendil-works/pi-ai";
import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  StreamFunction,
} from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  type FauxProviderHandle,
} from "@earendil-works/pi-ai/providers/faux";

import {
  AttributionError,
  GateHaltError,
  WeakGateError,
  fuse,
  readFusionRuns,
  recordFusionRun,
  runGatedFusion,
  runPanel,
  runSynthesis,
  type FusionRunRecord,
} from "@openkai/core";

interface FauxRig {
  streamFn: StreamFunction;
  model: Model<Api>;
  faux: FauxProviderHandle;
}

/** A faux provider + model + streamFn, scripted by system-prompt routing. */
function makeRig(route: (system: string, callCount: number) => string): FauxRig {
  const faux = fauxProvider({});
  // Each stream call shifts one queued step — queue a bounded run of the
  // same routing factory so every call in the run is served.
  const factory = (context: Context, _options: unknown, state: { callCount: number }) => {
    const text = route(context.systemPrompt ?? "", state.callCount);
    return fauxAssistantMessage([fauxText(text)]);
  };
  faux.setResponses(Array.from({ length: 16 }, () => factory));
  const models = createModels();
  models.setProvider(faux.provider);
  const model = models.getModel("faux", "faux-1");
  assert.ok(model, "faux-1 registered");
  const streamFn: StreamFunction = (m, ctx, opts): AssistantMessageEventStream =>
    models.streamSimple(m, ctx, opts);
  return { streamFn, model, faux };
}

const SYNTHESIS_JSON = JSON.stringify({
  consensus: ["both agree on the shape"],
  divergences: [
    {
      topic: "error style",
      architect: "structured codes",
      builder: "plain messages",
      kept: "architect",
    },
  ],
  discarded: [{ item: "global mutable state", reason: "untestable", by: "builder" }],
  blindSpots: ["no retry budget"],
});

test("panel: architect and builder run as separate sessions, role-attributed", async () => {
  const rig = makeRig((system) =>
    system.includes("ARCHITECT") ? "architect plan" : "builder deliverable",
  );
  const outputs = await runPanel(rig.streamFn, {
    task: "design a thing",
    architectModel: rig.model,
    builderModel: rig.model,
  });
  assert.equal(outputs.length, 2);
  const architect = outputs.find((o) => o.role === "architect");
  const builder = outputs.find((o) => o.role === "builder");
  assert.equal(architect?.text, "architect plan");
  assert.equal(builder?.text, "builder deliverable");
  assert.ok(architect && builder && architect.latencyMs >= 0 && builder.latencyMs >= 0);
});

test("synthesis: parses the structured merge with attribution intact", async () => {
  const rig = makeRig(() => SYNTHESIS_JSON);
  const synthesis = await runSynthesis(rig.streamFn, rig.model, "task", [
    { role: "architect", modelId: "faux-1", text: "A", usage: undefined, latencyMs: 1 },
    { role: "builder", modelId: "faux-1", text: "B", usage: undefined, latencyMs: 1 },
  ]);
  assert.deepEqual(synthesis.consensus, ["both agree on the shape"]);
  assert.equal(synthesis.divergences[0]?.kept, "architect");
  assert.equal(synthesis.discarded[0]?.by, "builder");
  assert.deepEqual(synthesis.blindSpots, ["no retry budget"]);
});

test("synthesis: unattributed divergence throws AttributionError", async () => {
  const bad = JSON.stringify({
    consensus: [],
    divergences: [{ topic: "x", architect: "", builder: "", kept: "both" }],
    discarded: [],
    blindSpots: [],
  });
  const rig = makeRig(() => bad);
  await assert.rejects(
    runSynthesis(rig.streamFn, rig.model, "task", [
      { role: "architect", modelId: "faux-1", text: "A", usage: undefined, latencyMs: 1 },
      { role: "builder", modelId: "faux-1", text: "B", usage: undefined, latencyMs: 1 },
    ]),
    (error: unknown) => error instanceof AttributionError,
  );
});

test("gate: all-green baseline throws WeakGateError carrying the baseline run", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-fusion-"));
  try {
    await assert.rejects(
      runGatedFusion({
        checks: [{ name: "trivially green", command: "true" }],
        cwd,
        initialWork: "work",
        repairWork: async () => "work",
      }),
      (error: unknown) =>
        error instanceof WeakGateError &&
        error.runs.length === 1 &&
        error.runs[0]?.purpose === "baseline" &&
        error.runs[0].pass,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("gate: full repair loop passes once applyWork materialises the work", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-fusion-"));
  const marker = path.join(cwd, "marker.txt");
  try {
    const { runs, finalWork } = await runGatedFusion({
      checks: [{ name: "marker exists", command: `test -f "${marker}"` }],
      cwd,
      initialWork: "the deliverable",
      applyWork: () => {
        void writeFile(marker, "done");
      },
      repairWork: async () => "repaired",
    });
    assert.equal(finalWork, "the deliverable");
    assert.equal(runs.length, 2);
    assert.equal(runs[0]?.purpose, "baseline");
    assert.equal(runs[0]?.pass, false);
    assert.equal(runs[1]?.purpose, "evaluation");
    assert.equal(runs[1]?.pass, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("gate: cap reached halts loudly with verbatim failures and full run history", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-fusion-"));
  try {
    let repairs = 0;
    await assert.rejects(
      runGatedFusion({
        checks: [{ name: "never green", command: "false" }],
        cwd,
        maxRounds: 2,
        initialWork: "v1",
        applyWork: () => undefined,
        repairWork: async (failures) => {
          repairs += 1;
          assert.match(failures, /FAIL never green/);
          return `v${repairs + 1}`;
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof GateHaltError);
        // 1 baseline + 2 evaluations; repair ran exactly once (rounds - 1).
        assert.equal(error.runs.length, 3);
        assert.equal(repairs, 1);
        assert.match(error.message, /escalating to triage/);
        return true;
      },
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("fuse (ungated): panel + synthesis + telemetry record in one call", async () => {
  const rig = makeRig((system) => {
    // Order matters: the synthesis prompt mentions both role names.
    if (system.includes("SYNTHESISER")) return SYNTHESIS_JSON;
    if (system.includes("ARCHITECT role")) return "architect position";
    return "builder position";
  });
  const result = await fuse(rig.streamFn, {
    task: "fused task",
    architectModel: rig.model,
    builderModel: rig.model,
  });
  assert.equal(result.outputs.length, 2);
  assert.equal(result.synthesis.divergences.length, 1);
  assert.equal(result.gate.outcome, "not-run");
  assert.equal(result.record.task, "fused task");
  assert.equal(result.record.gated, false);
  assert.ok(result.runId.length > 0);
});

test("telemetry: record + read round-trips through the runs log", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-fusion-"));
  const logPath = path.join(cwd, "runs.jsonl");
  const record: FusionRunRecord = {
    runId: "test-run-1",
    ts: new Date().toISOString(),
    task: "t",
    gated: false,
    roles: [],
    synthesis: undefined,
    gate: { rounds: 0, outcome: "not-run" },
    wallMs: 1,
  };
  try {
    await recordFusionRun(record, logPath);
    const runs = await readFusionRuns(logPath);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.runId, "test-run-1");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
