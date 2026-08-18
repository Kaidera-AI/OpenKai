/**
 * K3 REVIEW REPRODUCERS — release/0.1.007 adversarial pass (handoff b27bc40f,
 * kai → main@openkai, executed by ren@openkai). Each test pins a fixed
 * finding; a regression FAILS. Repro evidence: agent transcripts
 * (K3TierRouter / K3BridgeHub / K3TaskFusion), live-verified against dist.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideTier,
  testsPassed,
  windowSeverity,
  productionIntensity,
  SEVERITY,
  routeWithTier,
  extractAndValidateJson,
} from "@kaidera/openkai-core";
import { classifyConnectorPayload } from "../dist/connectors.js";

// ── tier scorer: signal fidelity ────────────────────────────────────────────

test("K3: 'failing' blocks the settled de-escalation (was invisible to fail literals)", () => {
  assert.equal(
    testsPassed([{ tool: "bash", resultText: "3 passed\nsuite status: failing" }]),
    false,
  );
  assert.equal(testsPassed([{ tool: "bash", resultText: "2 passed, 1 did not pass" }]), false);
  // And a genuinely failing run never de-escalates with confidence 1.
  const d = decideTier({
    signals: [
      { tool: "edit_file", resultText: "edited" },
      { tool: "bash", resultText: "3 passed\nsuite status: failing" },
    ],
    turnDepth: 3,
    compacted: false,
  });
  assert.notEqual(d.source, "tests_passed");
});

test("K3: mocha's 'passing' summary settles (was dead)", () => {
  const d = decideTier({
    signals: [
      { tool: "edit_file", resultText: "ok" },
      { tool: "bash", resultText: "  5 passing\n  0 failing" },
    ],
    turnDepth: 3,
    compacted: false,
  });
  assert.equal(d.source, "tests_passed");
  assert.equal(d.tier, "efficient");
});

test("K3: CamelCase error names score HARD (AssertionError was invisible)", () => {
  assert.equal(
    windowSeverity([{ tool: "bash", resultText: "AssertionError: assert got == want" }]),
    SEVERITY.HARD,
  );
  assert.equal(windowSeverity([{ tool: "bash", resultText: "RuntimeError: boom" }]), SEVERITY.HARD);
});

test("K3: plain nonzero exit is SOFT, not HARD (Switchyard calibration)", () => {
  assert.equal(windowSeverity([{ tool: "bash", resultText: "exit code 1" }]), SEVERITY.SOFT);
});

test("K3: a gate refusal is not severity (operator consent is not friction)", () => {
  assert.equal(
    windowSeverity([{ tool: "write_file", resultText: "Permission denied: rejected by operator" }]),
    0,
  );
});

test("K3: Jest's ✕ (U+2715) counts as a failure", () => {
  assert.equal(
    testsPassed([{ tool: "bash", resultText: "✓ adds\n✕ passes no arguments to ctor" }]),
    false,
  );
});

test("K3: bash writes count as production (sed/redirect/tee)", () => {
  const writes = [
    { tool: "bash", resultText: "", command: "sed -i s/a/b/ src.ts" },
    { tool: "bash", resultText: "", command: "echo x > new.ts" },
  ];
  assert.equal(productionIntensity(writes), 1);
  // …and a settled bash-only run takes the tests_passed path.
  const d = decideTier({
    signals: [
      { tool: "bash", resultText: "", command: "sed -i s/a/b/ src.ts" },
      { tool: "bash", resultText: "3 passed, 0 failed" },
    ],
    turnDepth: 3,
    compacted: false,
  });
  assert.equal(d.source, "tests_passed");
});

test("K3: routeWithTier falls open per stage (plan/review rest capable)", () => {
  const tiers = {
    efficient: { provider: "p", model: "cheap" },
    capable: { provider: "p", model: "strong" },
  };
  const plan = routeWithTier(
    { prompt: "design the auth architecture" },
    { signals: [], turnDepth: 1, compacted: false },
    {},
    tiers,
  );
  assert.equal(plan.stage, "plan");
  assert.equal(plan.model, "strong", "ambiguous plan turns rest on the capable member");
  const build = routeWithTier(
    { prompt: "implement the fix" },
    { signals: [], turnDepth: 1, compacted: false },
    {},
    tiers,
  );
  assert.equal(build.stage, "build");
  assert.equal(build.model, "cheap");
});

// ── task outputSchema extraction ────────────────────────────────────────────

test("K3: formal JSON Schema contracts validate (were guaranteed to fail)", () => {
  const schema = JSON.stringify({
    type: "object",
    required: ["summary"],
    properties: { summary: { type: "string" } },
  });
  const r = extractAndValidateJson('{"summary": "all good"}', schema);
  assert.ok(r.json, "a conforming object passes");
  const missing = extractAndValidateJson('{"other": 1}', schema);
  assert.match(missing.error ?? "", /missing required keys: summary/);
});

test("K3: the LAST valid JSON wins (first fence is often a placeholder)", () => {
  const schema = '"summary": string, "items": string[]';
  const answer =
    'Example:\n```json\n{"summary":"TODO placeholder","items":[]}\n```\nReal:\n```json\n{"summary":"REAL","items":["xss in login.ts:42"]}\n```';
  const r = extractAndValidateJson(answer, schema);
  assert.ok(r.json?.includes("REAL"), `expected the real answer, got: ${r.json ?? r.error}`);
});

test("K3: two bare objects / prose braces no longer poison the span", () => {
  const schema = '"summary": string';
  const r = extractAndValidateJson('Use {curly} blocks. Final: {"summary":"REAL"}', schema);
  assert.ok(r.json?.includes("REAL"));
});

test("K3: validated output is capped (context-flood guard)", () => {
  const huge = { summary: "x".repeat(5 * 1024 * 1024) };
  const r = extractAndValidateJson(JSON.stringify(huge), '"summary": string');
  assert.match(r.error ?? "", /exceeds/);
});

// ── connector classification ────────────────────────────────────────────────

test("K3: bot/subtype Slack events are ignored (self-loop guard)", () => {
  assert.equal(
    classifyConnectorPayload({
      type: "event_callback",
      event: { type: "message", subtype: "bot_message", bot_id: "B999", text: "kai said this" },
    }).kind,
    "ignore",
  );
  assert.equal(
    classifyConnectorPayload({
      type: "event_callback",
      event: { type: "message", subtype: "channel_join", text: "someone joined" },
    }).kind,
    "ignore",
  );
});

test("K3: Slack url_verification is classified as a challenge", () => {
  const e = classifyConnectorPayload({ type: "url_verification", challenge: "abc123" });
  assert.deepEqual(e, { kind: "challenge", challenge: "abc123" });
});

test("K3: real payloads carry prompt text and event ids for dedup", () => {
  const slack = classifyConnectorPayload({
    type: "event_callback",
    event_id: "Ev1",
    event: { type: "message", text: "deploy please" },
  });
  assert.deepEqual(slack, { kind: "prompt", text: "deploy please", eventId: "Ev1" });
  const tg = classifyConnectorPayload({ update_id: 42, message: { text: "status?" } });
  assert.deepEqual(tg, { kind: "prompt", text: "status?", eventId: "42" });
  // Telegram captions are read (photos carry instructions too).
  const cap = classifyConnectorPayload({ update_id: 43, message: { caption: "fix this", photo: [{}] } });
  assert.equal(cap.kind, "prompt");
});
