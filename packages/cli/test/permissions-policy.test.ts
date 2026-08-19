/**
 * E017 pick 7 — persisted per-tool approval policy tests.
 *
 * Covers: the gate's consultation order (deny floor terminal → per-tool
 * config override → autonomy axis → session always-cache → ask), the
 * config.json persist round-trip (`tools.approval.<tool>`), the headless
 * no-approval-channel error text, and the overlay's two always-stops.
 *
 * Deterministic + offline: the gate is exercised directly (no transport);
 * config tests run against a `OPENKAI_HOME` temp dir.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { SessionPermissionGate, type PushPermissionEvent } from "@kaidera/openkai-core";
import {
  readConfigFile,
  readToolApprovals,
  writeToolApproval,
  type ToolApprovalPolicy,
} from "../dist/config.js";
import { headlessApprovalError } from "../dist/chat.js";
import { PermissionOverlay, type PermissionDecision } from "../dist/tui/permission.js";

/** Strip ANSI escape sequences for plain-text assertions. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Build a gate over `cwd`; emitted permission_request events land in `requests`. */
function buildGate(
  cwd: string,
  requests: Array<{ requestId: string; toolName: string }>,
  toolPolicy?: () => Record<string, ToolApprovalPolicy>,
): SessionPermissionGate {
  const pushEvent: PushPermissionEvent = (event) => {
    requests.push({ requestId: event.requestId, toolName: event.toolName });
  };
  return new SessionPermissionGate({ cwd, pushEvent, ...(toolPolicy !== undefined ? { toolPolicy } : {}) });
}

const bashPreview = () => ({ kind: "command" as const, command: "echo hi", cwd: "/proj" });

/** Yield to the event loop so the gate's synchronous pushEvent has fired. */
function flush(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
}

/** Run `body` with OPENKAI_HOME pointed at a fresh temp dir; always restores. */
async function withTempHome(body: (home: string) => void | Promise<void>): Promise<void> {
  const home = await mkdtemp(path.join(tmpdir(), "ok-policy-home-"));
  const previous = process.env.OPENKAI_HOME;
  process.env.OPENKAI_HOME = home;
  try {
    await body(home);
  } finally {
    if (previous === undefined) delete process.env.OPENKAI_HOME;
    else process.env.OPENKAI_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
}

// ── 1. Override precedence order ────────────────────────────────────────────

test("precedence: config allow pre-approves at autonomy low (no prompt)", async () => {
  const requests: Array<{ requestId: string; toolName: string }> = [];
  const gate = buildGate("/proj", requests, () => ({ write_file: "allow" }));
  gate.setAutonomy("low");
  const outcome = await gate.request("write_file", "c1", { path: "a.txt", content: "x" }, () => ({
    kind: "diff" as const,
    path: "/proj/a.txt",
    before: "",
    after: "x",
  }));
  assert.equal(outcome.decision, "approve", "config allow approves without prompting");
  assert.equal(requests.length, 0, "no permission_request emitted");
});

test("precedence: config deny pins a tool even at autonomy high", async () => {
  const requests: Array<{ requestId: string; toolName: string }> = [];
  const gate = buildGate("/proj", requests, () => ({ bash: "deny" }));
  gate.setAutonomy("high");
  const outcome = await gate.request("bash", "c2", { command: "echo hi" }, bashPreview);
  assert.equal(outcome.decision, "reject", "config deny beats autonomy high");
  assert.match(outcome.decision === "reject" ? outcome.reason : "", /tools\.approval\.bash/);
  assert.equal(requests.length, 0, "a config deny never prompts");
});

test("precedence: the deny floor is terminal — a config allow cannot lift it", async () => {
  const requests: Array<{ requestId: string; toolName: string }> = [];
  const gate = buildGate("/proj", requests, () => ({ write_file: "allow" }));
  gate.setAutonomy("high");
  const outcome = await gate.request("write_file", "c3", { path: ".env", content: "SECRET=1" }, () => ({
    kind: "diff" as const,
    path: "/proj/.env",
    before: "",
    after: "SECRET=1",
  }));
  assert.equal(outcome.decision, "reject", "the floor still denies .env");
  assert.equal(requests.length, 0, "floor deny never reaches the override layer");
});

test("precedence: no config key falls through to ask", async () => {
  const requests: Array<{ requestId: string; toolName: string }> = [];
  const gate = buildGate("/proj", requests, () => ({}));
  gate.setAutonomy("low");
  const pending = gate.request("bash", "c4", { command: "echo hi" }, bashPreview);
  // The ask path emits the event and waits; answer it from the operator path.
  await flush();
  assert.equal(requests.length, 1, "absence of a key means prompt-by-default");
  gate.respond(requests[0]!.requestId, "once");
  const outcome = await pending;
  assert.equal(outcome.decision, "approve");
});

test("precedence: the policy source is live — mid-session config edits apply", async () => {
  const requests: Array<{ requestId: string; toolName: string }> = [];
  let map: Record<string, ToolApprovalPolicy> = {};
  const gate = buildGate("/proj", requests, () => map);
  gate.setAutonomy("low");

  // Before the override: bash prompts.
  const first = gate.request("bash", "c5", { command: "echo hi" }, bashPreview);
  await flush();
  assert.equal(requests.length, 1, "no override → prompt");
  gate.respond(requests[0]!.requestId, "once");
  await first;

  // The overlay's project stop writes the key mid-session; the next request
  // must consult the updated map without any gate restart.
  map = { bash: "allow" };
  const second = await gate.request("bash", "c6", { command: "echo again" }, bashPreview);
  assert.equal(second.decision, "approve", "the freshly written key pre-approves");
  assert.equal(requests.length, 1, "no second prompt after the override landed");
});

// ── 2. Persist round-trip (config.json tools.approval.*) ────────────────────

test("persist: write → read round-trip, overwrite, removal, pruning", async () => {
  await withTempHome(() => {
    assert.deepEqual(readToolApprovals(), {}, "no config → empty map");

    writeToolApproval("bash", "allow");
    writeToolApproval("write_file", "deny");
    assert.deepEqual(readToolApprovals(), { bash: "allow", write_file: "deny" });
    // The raw shape matches the documented contract.
    const raw = readConfigFile();
    assert.deepEqual(
      (raw["tools"] as Record<string, unknown>)["approval"],
      { bash: "allow", write_file: "deny" },
      "stored under tools.approval",
    );

    writeToolApproval("bash", "deny");
    assert.equal(readToolApprovals()["bash"], "deny", "last write wins");

    writeToolApproval("bash", undefined);
    assert.deepEqual(readToolApprovals(), { write_file: "deny" }, "undefined removes the key");

    // Removing the last key prunes the hollow maps.
    writeToolApproval("write_file", undefined);
    assert.deepEqual(readToolApprovals(), {});
    assert.equal(readConfigFile()["tools"], undefined, "empty tools map is pruned");
  });
});

test("persist: invalid values are filtered on read", async () => {
  await withTempHome((home) => {
    writeToolApproval("bash", "allow");
    // Hand-edit garbage into the map alongside the valid entry.
    const config = readConfigFile();
    (config["tools"] as Record<string, Record<string, unknown>>)["approval"] = {
      bash: "allow",
      write_file: "yolo",
      edit_file: 42,
    };
    writeFileSync(path.join(home, "config.json"), JSON.stringify(config));
    assert.deepEqual(readToolApprovals(), { bash: "allow" }, "only allow|deny survive the read");
  });
});

// ── 3. Headless no-approval-channel error (chat/serve) ──────────────────────

test("headless error: names the tool, the config key, and the autonomy alternative", () => {
  const text = headlessApprovalError("bash");
  assert.ok(text.includes('"bash"'), "names the tool");
  assert.ok(text.includes('tools": { "approval": { "bash": "allow" }'), "names the exact config key to allow it");
  assert.ok(text.includes("~/.openkai/config.json"), "points at the config file");
  assert.ok(/autonomy/i.test(text), "offers the autonomy alternative");
  assert.ok(text.includes("headless"), "states why it cannot ask");
  assert.ok(/interactive/i.test(text), "offers the interactive fallback");
});

test("headless shape: an unanswered ask is rejected, never hung or auto-approved", async () => {
  const requests: Array<{ requestId: string; toolName: string }> = [];
  const gate = buildGate("/proj", requests, () => ({}));
  const pending = gate.request("bash", "c7", { command: "rm -rf build" }, bashPreview);
  await flush();
  assert.equal(requests.length, 1);
  // This is exactly what chat.ts does on a permission_request: surface the
  // actionable error, then reject — the run continues instead of hanging.
  const guidance = headlessApprovalError(requests[0]!.toolName);
  gate.respond(requests[0]!.requestId, "reject");
  const outcome = await pending;
  assert.equal(outcome.decision, "reject", "headless ask resolves as refused");
  assert.ok(guidance.includes("rm -rf build") === false, "guidance names the tool, not the payload");
  assert.ok(guidance.includes('"bash"'));
});

// ── 4. The overlay's two always-stops ───────────────────────────────────────

test("overlay: renders both always-stops (session vs project)", () => {
  const overlay = new PermissionOverlay({
    toolName: "bash",
    rule: "ask — bash requires approval",
    preview: { kind: "command", command: "ls", cwd: "/p" },
    onDecision: () => {},
  });
  const frame = overlay.render(80).map(stripAnsi).join("\n");
  assert.ok(frame.includes("Always (session)"), "session-scoped stop present");
  assert.ok(frame.includes("Always (this project)"), "project-scoped stop present");
  assert.ok(frame.includes("Allow once"), "once stop unchanged");
  assert.ok(frame.includes("Reject"), "reject stop unchanged");
});

test("overlay: the session stop emits always WITHOUT persisting", async () => {
  await withTempHome(() => {
    const decisions: PermissionDecision[] = [];
    const overlay = new PermissionOverlay({
      toolName: "bash",
      rule: "ask",
      preview: { kind: "command", command: "ls", cwd: "/p" },
      onDecision: (d) => decisions.push(d),
    });
    overlay.handleInput("\x1b[B"); // Allow once → Always (session)
    overlay.handleInput("\r");
    assert.deepEqual(decisions, ["always"], "session stop emits plain always");
    assert.deepEqual(readToolApprovals(), {}, "session stop writes nothing to config");
  });
});

test("overlay: the project stop persists tools.approval.<tool>=allow AND emits always", async () => {
  await withTempHome(() => {
    const decisions: PermissionDecision[] = [];
    const overlay = new PermissionOverlay({
      toolName: "bash",
      rule: "ask",
      preview: { kind: "command", command: "ls", cwd: "/p" },
      onDecision: (d) => decisions.push(d),
    });
    overlay.handleInput("\x1b[B"); // → Always (session)
    overlay.handleInput("\x1b[B"); // → Always (this project)
    overlay.handleInput("\r");
    assert.deepEqual(decisions, ["always"], "controller contract unchanged (plain always)");
    assert.equal(readToolApprovals()["bash"], "allow", "config key persisted");
  });
});
