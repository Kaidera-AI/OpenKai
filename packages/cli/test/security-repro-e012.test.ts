/**
 * SECURITY GATE REPRODUCERS — E012, ren@openkai's adversarial review fixes.
 *
 * Each test pins one fixed finding from the review so a regression FAILS:
 *
 *  C1  hashline_edit was an ungated arbitrary file-write: no permission
 *      round-trip, no deny floor, lexical-only containment (sibling-prefix
 *      and symlink escapes), no shadow snapshot. Fix: gate + guardPath +
 *      hooks, same posture as write_file/edit_file.
 *  H1  Any configured MCP server REPLACED the built-in tool set
 *      (runtime passed mcpTools as `tools`). Fix: merge, never replace.
 *  WIP Plan mode lived only in the TUI's tool-list swap: in-flight turns
 *      kept mutations. Fix: the gate itself refuses while plan mode is on.
 *  —   abort()/close() left gate requests pending forever. Fix: rejectAll.
 *  H5  Provider failures never surfaced: turn_end dropped errorMessage.
 *  H4  Resuming a session wrote a second header, restarted seq, and broke
 *      the parent chain. Fix: rehydrate on ensure().
 *  —   One corrupt JSONL line bricked a whole session. Fix: skip bad lines.
 *  H8  A gate check that TIMED OUT was classified exit 127 ("command not
 *      found") and triggered gate repair. Fix: distinct timedOut kind.
 *  H10 Fusion telemetry persisted/exported secrets unredacted.
 *  —   The project .env could set OPENKAI_* / CORTEX_* knobs (the upgrade
 *      RCE chain). Fix: credential-names-only allowlist for project files.
 *  —   ~/.openkai/config.json (MCP tokens) was written world-readable.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile, appendFile, stat, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  gatedTools,
  SessionPermissionGate,
  SessionStore,
  ShadowGit,
  mapAgentEvent,
  runGate,
  recordFusionRun,
  type FusionRunRecord,
  type PushPermissionEvent,
} from "@kaidera/openkai-core";
import type { AgentEvent, AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import { loadDotEnv } from "../dist/env.js";
import { writeConfigFile, readConfigFile, configFilePath } from "../dist/config.js";

/** A gate whose captured requests can be answered by the test. */
function makeGate(cwd: string) {
  const requests: Array<{ requestId: string; toolName: string }> = [];
  const pushEvent: PushPermissionEvent = (e) => {
    requests.push({ requestId: e.requestId, toolName: e.toolName });
  };
  const gate = new SessionPermissionGate({ cwd, pushEvent });
  return { gate, requests };
}

function toolByName(tools: AgentTool<any>[], name: string): AgentTool<any> {
  const tool = tools.find((t) => t.name === name);
  assert.ok(tool, `${name} must be in the tool set`);
  return tool;
}

function resultText(result: { content: unknown }): string {
  const parts = (result as { content: Array<{ type: string; text?: string }> }).content;
  return parts.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n");
}

/** Macrotask tick (rule: withResolvers over executor form). */
function tick(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
}

/** Poll a condition across macrotasks (async preview builders need several). */
async function until(cond: () => boolean, tries = 50): Promise<void> {
  for (let i = 0; i < tries && !cond(); i += 1) await tick();
}

// ── C1: hashline_edit is gated, floored, and confined ───────────────────────

test("C1: hashline_edit requires operator approval before writing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-e012-hashline-"));
  try {
    await writeFile(path.join(dir, "a.txt"), "one\ntwo\nthree\n", "utf-8");
    const { gate, requests } = makeGate(dir);
    const tools = gatedTools(dir, gate);
    const hashline = toolByName(tools, "hashline_edit");

    // Read to learn the tag — allowed (read-only), no approval needed.
    const read = await hashline.execute("tc-read", { op: "read", path: "a.txt" });
    const tagMatch = /#([0-9a-f]{4})\]/.exec(resultText(read));
    assert.ok(tagMatch, "op=read returns the [path#TAG] header");

    // Edit without answering the request: must NOT resolve to a write.
    const editPromise = hashline.execute("tc-edit", {
      op: "edit",
      path: "a.txt",
      tag: tagMatch[1],
      hunks: [{ op: "PUT", start: 2, end: 2, body: ["TWO"] }],
    });
    // The gate must have emitted exactly one permission_request.
    await until(() => requests.length > 0);
    assert.equal(requests.length, 1, "edit emits a permission_request");
    assert.equal(requests[0]!.toolName, "hashline_edit");
    // Reject → no write.
    gate.respond(requests[0]!.requestId, "reject");
    const rejected = resultText(await editPromise);
    assert.match(rejected, /Permission denied/);
    assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\ntwo\nthree\n");

    // Approve → write lands.
    const edit2 = hashline.execute("tc-edit-2", {
      op: "edit",
      path: "a.txt",
      tag: tagMatch[1],
      hunks: [{ op: "PUT", start: 2, end: 2, body: ["TWO"] }],
    });
    await until(() => requests.length > 1);
    assert.equal(requests.length, 2);
    gate.respond(requests[1]!.requestId, "once");
    await edit2;
    assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\nTWO\nthree\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("C1: hashline_edit honours the deny floor and cwd containment", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "openkai-e012-hlparent-"));
  const dir = path.join(parent, "proj");
  await mkdir(dir);
  try {
    await writeFile(path.join(dir, ".env"), "SECRET=hunter2hunter2\n", "utf-8");
    const { gate } = makeGate(dir);
    const hashline = toolByName(gatedTools(dir, gate), "hashline_edit");

    // Floor file: refused before any read (no oracle).
    const envRead = resultText(await hashline.execute("t1", { op: "read", path: ".env" }));
    assert.match(envRead, /denied|protected/i);
    assert.ok(!envRead.includes("hunter2"), "floor file content must not leak");

    // Sibling-prefix escape: /tmp/proj-evil starts with /tmp/proj lexically.
    const evil = path.join(parent, "proj-evil");
    await mkdir(evil);
    await writeFile(path.join(evil, "x.ts"), "pwned\n", "utf-8");
    const escape = resultText(await hashline.execute("t2", { op: "read", path: "../proj-evil/x.ts" }));
    assert.match(escape, /escapes|denied/i);
    assert.ok(!escape.includes("pwned"), "out-of-cwd content must not leak");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

// ── H1: extraTools merge — built-ins never vanish ───────────────────────────

test("H1: extraTools augment the built-in set instead of replacing it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-e012-extra-"));
  try {
    const { gate } = makeGate(dir);
    const fakeMcp: AgentTool<any> = {
      name: "mcp__demo__thing",
      label: "demo",
      description: "stand-in for an MCP proxy tool",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { content: [{ type: "text", text: "ok" }], details: undefined };
      },
    };
    const tools = gatedTools(dir, gate, undefined, undefined, [fakeMcp]);
    const names = tools.map((t) => t.name);
    for (const builtin of ["read_file", "write_file", "edit_file", "bash", "hashline_edit", "task"]) {
      assert.ok(names.includes(builtin), `${builtin} survives extra tools`);
    }
    assert.ok(names.includes("mcp__demo__thing"), "the extra tool is present");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── Plan mode + gate liveness ───────────────────────────────────────────────

test("plan mode refuses gated requests at the gate itself", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-e012-plan-"));
  try {
    const { gate } = makeGate(dir);
    gate.setPlanMode(true);
    const outcome = await gate.request("write_file", "tc", { path: "x", content: "y" }, () => {
      throw new Error("preview must not build for a plan-mode refusal");
    });
    assert.equal(outcome.decision, "reject");
    assert.match(outcome.decision === "reject" ? outcome.reason : "", /plan mode/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejectAll settles pending approvals as reject", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-e012-rejectall-"));
  try {
    const { gate, requests } = makeGate(dir);
    const pending = gate.request("bash", "tc", { command: "true" }, () => ({
      kind: "command",
      command: "true",
      cwd: dir,
    }));
    await until(() => requests.length > 0);
    assert.equal(requests.length, 1, "the request is pending operator input");
    gate.rejectAll("aborted");
    const outcome = await pending;
    assert.equal(outcome.decision, "reject");
    assert.match(outcome.decision === "reject" ? outcome.reason : "", /aborted/);
    assert.equal(gate.pendingCount, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── H5: provider failures surface as error events ───────────────────────────

test("H5: turn_end with stopReason error maps to an error event", () => {
  // Synthetic settled failure frame — pi-agent-core's AgentEvent union is
  // broad; this is the shape handleRunFailure emits (dist verified).
  const failure = {
    type: "turn_end",
    message: {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage: "429 insufficient credits",
      timestamp: 0,
    },
  } as unknown as AgentEvent;
  const events = mapAgentEvent(failure);
  const error = events.find((e) => e.kind === "error");
  assert.ok(error, "an error event is emitted");
  assert.ok("message" in error && error.message.includes("429"), "the provider message survives");
  assert.ok(events.some((e) => e.kind === "turn_end"), "turn_end still follows");

  const ok = {
    type: "turn_end",
    message: { role: "assistant", content: [], stopReason: "stop", timestamp: 0 },
  } as unknown as AgentEvent;
  assert.ok(!mapAgentEvent(ok).some((e) => e.kind === "error"), "clean turns emit no error");
});

// ── H4: session resume keeps the tree well-formed ───────────────────────────

test("H4: resuming a session writes no second header and continues the chain", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "openkai-e012-resume-"));
  try {
    const first = new SessionStore({ root, sessionId: "s-resume" });
    await first.ensure();
    const firstId = await first.appendMessage({ role: "user", content: "hello", timestamp: 1 } as unknown as AgentMessage);
    await first.close();

    const second = new SessionStore({ root, sessionId: "s-resume" });
    await second.ensure();
    const secondId = await second.appendMessage({ role: "assistant", content: "hi", timestamp: 2 } as unknown as AgentMessage);
    await second.close();

    const entries = await new SessionStore({ root, sessionId: "s-resume" }).readEntries();
    const messages = entries.filter((e) => e.type === "message");
    assert.equal(messages.length, 2);
    assert.equal(messages[0]!.seq, 1);
    assert.equal(messages[1]!.seq, 2, "seq continues across resume");
    assert.equal(messages[1]!.parentId, firstId, "the chain is not severed");
    assert.notEqual(firstId, secondId);

    // Exactly one header line in the file.
    const raw = await readFile(path.join(root, "s-resume", "session.jsonl"), "utf-8");
    const headers = raw.split("\n").filter((l) => l.includes('"type":"header"'));
    assert.equal(headers.length, 1, "no duplicate header on resume");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a truncated final JSONL line does not brick the session", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "openkai-e012-corrupt-"));
  try {
    const store = new SessionStore({ root, sessionId: "s-corrupt" });
    await store.ensure();
    await store.appendMessage({ role: "user", content: "kept", timestamp: 1 } as unknown as AgentMessage);
    await store.close();
    // Simulate a crash mid-append: partial line at the tail.
    await appendFile(path.join(root, "s-corrupt", "session.jsonl"), '{"type":"message","id":"broken');
    const entries = await new SessionStore({ root, sessionId: "s-corrupt" }).readEntries();
    assert.equal(entries.filter((e) => e.type === "message").length, 1, "the good entry survives");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ── H8: gate timeout is not "command not found" ─────────────────────────────

test("H8: a timed-out check is not classified as exit 127", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-e012-gate-"));
  try {
    const run = await runGate(
      [
        { name: "slow", command: "sleep 5" },
        { name: "missing", command: "definitely-not-a-real-binary-e012" },
      ],
      "evaluation",
      { cwd: dir, timeoutMs: 500 },
    );
    const slow = run.results.find((r) => r.check.name === "slow")!;
    assert.equal(slow.timedOut, true, "timeout is its own kind");
    assert.notEqual(slow.exitCode, 127, "timeout must not masquerade as 127");
    const missing = run.results.find((r) => r.check.name === "missing")!;
    assert.equal(missing.exitCode, 127, "genuine command-not-found keeps 127");
    assert.equal(missing.timedOut, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── H10: fusion telemetry redacts secrets before persisting ─────────────────

test("H10: fusion run records are redacted at the persistence seam", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-e012-telemetry-"));
  const logPath = path.join(dir, "runs.jsonl");
  const secret = "gsk_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  try {
    const record: FusionRunRecord = {
      runId: "r-e012",
      ts: new Date(0).toISOString(),
      task: `wire the key ${secret} into the provider`,
      gated: false,
      roles: [
        { role: "architect", modelId: "m", text: `use ${secret} here`, usage: undefined, latencyMs: 1 },
        { role: "builder", modelId: "m", text: "done", usage: undefined, latencyMs: 1 },
      ],
      synthesis: undefined,
      gate: { rounds: 0, outcome: "not-run" },
      wallMs: 2,
    };
    await recordFusionRun(record, logPath);
    const onDisk = await readFile(logPath, "utf-8");
    assert.ok(!onDisk.includes(secret), "the secret never reaches disk");
    assert.match(onDisk, /\[redacted-secret\]/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── env allowlist: project .env cannot steer the harness ────────────────────

test("project .env sets provider keys but never OPENKAI_*/CORTEX_* knobs", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "openkai-e012-home-"));
  const project = await mkdtemp(path.join(tmpdir(), "openkai-e012-proj-"));
  const saved: Record<string, string | undefined> = {};
  const keys = ["HOME", "OPENKAI_MANIFEST_URL", "CORTEX_API_URL", "E012_TEST_API_KEY"];
  for (const k of keys) saved[k] = process.env[k];
  try {
    delete process.env.OPENKAI_MANIFEST_URL;
    delete process.env.CORTEX_API_URL;
    delete process.env.E012_TEST_API_KEY;
    process.env.HOME = home;
    await mkdir(path.join(home, ".openkai"), { recursive: true });
    await writeFile(
      path.join(project, ".env"),
      [
        "OPENKAI_MANIFEST_URL=https://evil.example/latest.json",
        "CORTEX_API_URL=https://evil.example/cortex",
        "E012_TEST_API_KEY=sk-test-projectkeyprojectkey",
      ].join("\n"),
      "utf-8",
    );
    loadDotEnv(project);
    assert.equal(process.env.OPENKAI_MANIFEST_URL, undefined, "project .env cannot redirect upgrades");
    assert.equal(process.env.CORTEX_API_URL, undefined, "project .env cannot redirect Cortex");
    assert.equal(process.env.E012_TEST_API_KEY, "sk-test-projectkeyprojectkey", "provider keys still load");
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await rm(home, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

// ── config permissions: credential-bearing files are owner-only ─────────────

test("config.json is written 0600 and pre-existing loose files are tightened", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "openkai-e012-cfg-"));
  const savedHome = process.env.HOME;
  const savedOpenkaiHome = process.env.OPENKAI_HOME;
  try {
    process.env.HOME = home;
    delete process.env.OPENKAI_HOME;
    writeConfigFile({ mcpServers: {} });
    const mode = (await stat(configFilePath())).mode & 0o777;
    assert.equal(mode, 0o600, "fresh config is owner-only");
    // A pre-existing loose file is repaired on the next write.
    await chmod(configFilePath(), 0o644);
    writeConfigFile({ mcpServers: {} });
    assert.equal((await stat(configFilePath())).mode & 0o777, 0o600, "loose perms are repaired");
    assert.deepEqual(readConfigFile(), { mcpServers: {} }, "content round-trips");
  } finally {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedOpenkaiHome === undefined) delete process.env.OPENKAI_HOME;
    else process.env.OPENKAI_HOME = savedOpenkaiHome;
    await rm(home, { recursive: true, force: true });
  }
});

// ── shadow git: ambient GIT_* vars must not redirect shadow ops ─────────────

test("shadow snapshots ignore a poisoned GIT_INDEX_FILE", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-e012-shadow-"));
  const savedIndex = process.env.GIT_INDEX_FILE;
  try {
    // Point the ambient index at a file inside a trap location; a shadow op
    // honouring it would create/write there.
    const trap = path.join(dir, "trap-index");
    process.env.GIT_INDEX_FILE = trap;
    const shadow = new ShadowGit(dir);
    await writeFile(path.join(dir, "f.txt"), "v1\n", "utf-8");
    await shadow.snapshot("before write_file: f.txt");
    assert.equal((await stat(trap).catch(() => undefined)), undefined, "the ambient index file is never touched");
  } finally {
    if (savedIndex === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = savedIndex;
    await rm(dir, { recursive: true, force: true });
  }
});
