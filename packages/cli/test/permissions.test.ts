/**
 * P4b permission engine + protocol-v2 approval-channel tests (scope §6).
 *
 * Deterministic + offline: pure {@link evaluate} policy tests need no I/O; the
 * transport round-trip tests use a pi-ai faux provider (scripted `write_file`
 * tool calls) + a real {@link InProcessTransport} with the permission gate
 * enabled. All filesystem mutation is confined to a `node:fs.mkdtemp` temp dir;
 * no test runs a destructive shell command (the `bash` guarantee is proved by
 * the pure engine, not by executing bash).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels, uuidv7 } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";

import {
  InProcessTransport,
  evaluate,
  type PermissionRule,
} from "@kaidera/openkai-core";
import { PermissionOverlay } from "../dist/tui/permission.js";
import { OVERLAY_FOOTER } from "../dist/tui/theme.js";

/** Strip ANSI escape sequences for plain-text assertions. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── A. Pure policy engine (scope §3) — no I/O, no transport ───────────────────

test("policy: .env stays denied even with a trailing `allow **` rule (deny is terminal)", () => {
  const cwd = "/proj";
  const rules: PermissionRule[] = [{ path: "**", decision: "allow", label: "allow-all" }];
  // The deny floor is checked before the rule walk, so the last `allow **` rule
  // cannot promote a protected path. Last-match-wins sits *under* the floor.
  assert.equal(evaluate("write_file", { path: ".env" }, cwd, rules), "deny");
  assert.equal(evaluate("write_file", { path: "secrets/.env" }, cwd, rules), "deny");
  assert.equal(evaluate("write_file", { path: ".env.local" }, cwd, rules), "deny");
  assert.equal(evaluate("edit_file", { path: ".env" }, cwd, rules), "deny");
});

test("policy: last-match-wins ordering across two overlapping globs", () => {
  const cwd = "/proj";
  const rules: PermissionRule[] = [
    { path: "src/**", decision: "ask", label: "src-ask" },
    { path: "src/*.ts", decision: "allow", label: "ts-allow" },
  ];
  // `src/a.ts` matches both; the later `ts-allow` wins → allow.
  assert.equal(evaluate("write_file", { path: "src/a.ts" }, cwd, rules), "allow");
  // `src/a.js` matches only the first → ask.
  assert.equal(evaluate("write_file", { path: "src/a.js" }, cwd, rules), "ask");
  // Outside src → default ask (no rule matches).
  assert.equal(evaluate("write_file", { path: "README.md" }, cwd, rules), "ask");
});

test("policy: bash never resolves to allow (the dangerous-one backstop)", () => {
  const cwd = "/proj";
  // A trailing `allow **` path rule doesn't match bash (no path arg) → ask.
  assert.equal(evaluate("bash", { command: "echo hi" }, cwd, [{ path: "**", decision: "allow" }]), "ask");
  // Even a match-all rule (no tool, no path) cannot promote bash past ask — the
  // engine clamps an `allow` for bash back to `ask`.
  assert.equal(evaluate("bash", { command: "rm -rf /" }, cwd, [{ decision: "allow" } as PermissionRule]), "ask");
  // An explicit bash-targeted allow is also clamped.
  assert.equal(evaluate("bash", { command: "echo hi" }, cwd, [{ tool: "bash", decision: "allow" }]), "ask");
  // A deny rule still denies.
  assert.equal(evaluate("bash", { command: "echo hi" }, cwd, [{ decision: "deny" } as PermissionRule]), "deny");
});

test("policy: out-of-cwd paths are denied", () => {
  const cwd = "/proj";
  assert.equal(evaluate("write_file", { path: "../outside.txt" }, cwd), "deny");
  assert.equal(evaluate("read_file", { path: "../../etc/passwd" }, cwd), "deny");
  // A path that resolves back into cwd via `..` is fine.
  assert.equal(evaluate("write_file", { path: "sub/../inside.txt" }, cwd), "ask");
  // An absolute path inside cwd is fine.
  assert.equal(evaluate("write_file", { path: "/proj/inside.txt" }, cwd), "ask");
  // An absolute path outside cwd is denied.
  assert.equal(evaluate("write_file", { path: "/etc/hosts" }, cwd), "deny");
});

// ── B. Transport round-trip + always-scoping (scope §6) — real gate, tmp fs ──

/** Build a gated transport over a faux provider, cwd = `tmpDir`, scripted responses. */
function buildGatedTransport(tmpDir: string, responses: ReturnType<typeof fauxAssistantMessage>[]): InProcessTransport {
  const faux = fauxProvider({});
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  return new InProcessTransport({
    sessionId: uuidv7(),
    modelId: "faux-1",
    models,
    provider: "faux",
    cwd: tmpDir,
    enablePermissions: true,
  });
}

/** Drain transport events; call `onPermissionRequest(requestId)` when one arrives. */
async function drainEvents(
  transport: InProcessTransport,
  onPermissionRequest: (requestId: string, event: { toolName: string; rule: string }) => void,
): Promise<{ events: import("@kaidera/openkai-core").SessionEvent[]; permissionCount: number }> {
  const events: import("@kaidera/openkai-core").SessionEvent[] = [];
  let permissionCount = 0;
  const iter = transport.events()[Symbol.asyncIterator]();
  for (;;) {
    const { value, done } = await iter.next();
    if (done) break;
    events.push(value);
    if (value.kind === "permission_request") {
      permissionCount += 1;
      onPermissionRequest(value.requestId, { toolName: value.toolName, rule: value.rule });
    }
    // The session stream stays open across turns (no auto-close); the turn
    // is complete at session_end, so stop draining there.
    if (value.kind === "session_end") break;
  }
  await iter.return?.();
  return { events, permissionCount };
}

/** File exists helper (rejects with ENOENT → false). */
async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test("round-trip: permission_request → respond('reject') leaves the file unchanged", async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), "ok-perm-reject-"));
  try {
    const transport = buildGatedTransport(tmp, [
      fauxAssistantMessage([fauxText("writing"), fauxToolCall("write_file", { path: "rejected.txt", content: "SHOULD NOT EXIST" })]),
      fauxAssistantMessage([fauxText("denied, moving on")]),
    ]);

    const promptP = transport.prompt("write rejected.txt");
    let answered = false;
    const { events, permissionCount } = await drainEvents(transport, (requestId) => {
      assert.equal(answered, false, "only one permission_request expected");
      answered = true;
      transport.respond(requestId, "reject");
    });
    await promptP;

    assert.equal(permissionCount, 1, "exactly one permission_request was emitted");
    assert.equal(answered, true, "the request was answered with reject");
    // The file must NOT exist — the tool never wrote because it was rejected.
    assert.equal(await fileExists(path.join(tmp, "rejected.txt")), false, "file must not exist after reject");
    // A tool_result was emitted (the refusal result returned to the model).
    assert.ok(events.some((e) => e.kind === "tool_result"), "a tool_result was emitted for the refused call");
    await transport.close();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("round-trip: respond('once') approves one write; the file appears", async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), "ok-perm-once-"));
  try {
    const transport = buildGatedTransport(tmp, [
      fauxAssistantMessage([fauxText("writing"), fauxToolCall("write_file", { path: "once.txt", content: "approved" })]),
      fauxAssistantMessage([fauxText("done")]),
    ]);

    const promptP = transport.prompt("write once.txt");
    const { permissionCount } = await drainEvents(transport, (requestId) => {
      transport.respond(requestId, "once");
    });
    await promptP;

    assert.equal(permissionCount, 1, "one permission_request emitted for the once-approved call");
    const { readFile } = await import("node:fs/promises");
    const written = await readFile(path.join(tmp, "once.txt"), "utf-8");
    assert.equal(written, "approved", "the once-approved write landed on disk");
    await transport.close();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("always-scoping: no re-prompt within a session, but a fresh prompt in a new session", async () => {
  // Two identical write_file calls in ONE session (separate turns). The first
  // is answered `always`; the second hits the session-scoped cache and does
  // NOT re-prompt (scope §6 always-scoping test).
  const tmp = await mkdtemp(path.join(tmpdir(), "ok-perm-always-"));
  try {
    const transport = buildGatedTransport(tmp, [
      fauxAssistantMessage([fauxText("a"), fauxToolCall("write_file", { path: "a.txt", content: "x" })]),
      fauxAssistantMessage([fauxText("b"), fauxToolCall("write_file", { path: "a.txt", content: "x" })]),
      fauxAssistantMessage([fauxText("done")]),
    ]);

    const promptP = transport.prompt("write a.txt twice");
    const { permissionCount } = await drainEvents(transport, (requestId) => {
      // Only the first call prompts; answer it `always`.
      transport.respond(requestId, "always");
    });
    await promptP;

    assert.equal(permissionCount, 1, "only the first identical call re-prompts; the second uses the always cache");
    const { readFile } = await import("node:fs/promises");
    assert.equal(await readFile(path.join(tmp, "a.txt"), "utf-8"), "x", "file written");
    await transport.close();

    // ── New session: fresh transport → fresh gate → fresh prompt ──────────
    const tmp2 = await mkdtemp(path.join(tmpdir(), "ok-perm-always2-"));
    try {
      const transport2 = buildGatedTransport(tmp2, [
        fauxAssistantMessage([fauxText("a"), fauxToolCall("write_file", { path: "a.txt", content: "x" })]),
        fauxAssistantMessage([fauxText("done")]),
      ]);
      const promptP2 = transport2.prompt("write a.txt once");
      const { permissionCount: pc2 } = await drainEvents(transport2, (requestId) => {
        transport2.respond(requestId, "once");
      });
      await promptP2;
      assert.equal(pc2, 1, "a fresh session prompts again — `always` is session-scoped (in memory only)");
      await transport2.close();
    } finally {
      await rm(tmp2, { recursive: true, force: true });
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// ── C. Golden-frame: the permission overlay (scope §5 + §6) ────────────────

test("golden-frame: overlay shows the P4a footer grammar and theme-token diff colours", async () => {
  const overlay = new PermissionOverlay({
    toolName: "write_file",
    rule: "ask — default for write_file",
    preview: { kind: "diff", path: "/tmp/proj/a.txt", before: "old line one\nold line two", after: "new line one\nnew line two" },
    onDecision: () => {},
  });
  const raw = overlay.render(80);
  const frame = raw.map(stripAnsi).join("\n");
  const rawFrame = raw.join("\n");

  // Footer grammar — identical to every other overlay (scope §3.2 + §5).
  assert.ok(frame.includes(OVERLAY_FOOTER), "overlay must carry the canonical footer grammar");
  // Tool header + rule line.
  assert.ok(frame.includes("write_file"), "overlay header shows the tool name");
  assert.ok(/ask — default for write_file/.test(frame), "overlay shows the policy-engine reason");
  // Diff lines: removed (before) with `- `, added (after) with `+ `.
  assert.ok(frame.includes("- old line one"), "removed lines are prefixed `- `");
  assert.ok(frame.includes("+ new line one"), "added lines are prefixed `+ `");
  // Theme-token diff colours (scope §5): added → highlight.base (cyan 39),
  // removed → highlight.danger (red 124). Ad-hoc colour literals are a defect.
  assert.ok(rawFrame.includes("\x1b[38;5;39m"), "added diff lines use the cyan highlight token (39)");
  assert.ok(rawFrame.includes("\x1b[38;5;124m"), "removed diff lines use the red danger token (124)");
  // The three approval actions are present.
  assert.ok(frame.includes("Allow once"), "Allow once action present");
  assert.ok(frame.includes("Allow always"), "Allow always action present");
  assert.ok(frame.includes("Reject"), "Reject action present");

  // Capture the acceptance-evidence overlay frame from THIS run, so the
  // committed artifact cannot drift from what the code actually renders.
  await writeFile(
    new URL("../test/evidence/permission-overlay.txt", import.meta.url),
    [
      "# P4b permission-overlay golden-frame evidence (headless render, 80 cols)",
      "# Regenerated by `npm test -w @openkai/cli` — do not hand-edit.",
      "# Footer grammar: " + OVERLAY_FOOTER,
      "# Diff colours: added=highlight.base(cyan 39) removed=highlight.danger(red 124)",
      "",
      raw.join("\n"),
      "",
    ].join("\n"),
  );
});

test("golden-frame: command preview overlay (bash)", () => {
  const overlay = new PermissionOverlay({
    toolName: "bash",
    rule: "ask — bash requires approval (never auto-allowed)",
    preview: { kind: "command", command: "echo hello", cwd: "/tmp/proj" },
    onDecision: () => {},
  });
  const frame = overlay.render(80).map(stripAnsi).join("\n");
  assert.ok(frame.includes(OVERLAY_FOOTER), "command preview carries the canonical footer");
  assert.ok(frame.includes("echo hello"), "command preview shows the command");
  assert.ok(frame.includes("/tmp/proj"), "command preview shows the resolved cwd");
});
