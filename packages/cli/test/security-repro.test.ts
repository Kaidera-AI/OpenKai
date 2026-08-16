/**
 * SECURITY GATE REPRODUCERS — E001 §2 verification of cole's first security
 * review (handback a75cd416), which reported "deny-floor escape" and
 * "symlink/encoded-path traversal" as HELD with no reproducer on disk.
 *
 * These tests assert the CURRENT (vulnerable) behaviour so they pass on the
 * unfixed tree and prove the exploit. They are written to be inverted once the
 * fix lands: flip the marked assertions to expect "deny" / an error.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, symlink, mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  evaluate,
  evaluateWithReason,
  readOnlyTools,
  gatedTools,
  SessionPermissionGate,
  SessionStore,
  ShadowGit,
  type PushPermissionEvent,
} from "@openkai/core";
import { Transcript } from "../dist/tui/transcript.js";
import { PermissionOverlay } from "../dist/tui/permission.js";

function readTool(cwd: string) {
  const t = readOnlyTools(cwd).find((x) => x.name === "read_file");
  assert.ok(t, "read_file tool must exist");
  return t!;
}

async function callRead(cwd: string, p: string): Promise<string> {
  const res: any = await readTool(cwd).execute("t1", { path: p } as any);
  return res.content.map((c: any) => c.text).join("");
}

/** A gate that auto-answers every `ask` with `answer` (no operator in tests). */
function autoGate(
  cwd: string,
  answer: "once" | "always" | "reject" = "once",
): SessionPermissionGate {
  const pushEvent: PushPermissionEvent = (event) => {
    setImmediate(() => gate.respond(event.requestId, answer));
  };
  const gate = new SessionPermissionGate({ cwd, pushEvent });
  return gate;
}

/** Fetch a gated tool by name. */
function gatedTool(cwd: string, gate: SessionPermissionGate, name: string) {
  const t = gatedTools(cwd, gate).find((x) => x.name === name);
  assert.ok(t, `${name} tool must exist`);
  return t!;
}

/**
 * Join a tool result's text content without trusting the envelope shape —
 * these assertions run against hostile inputs, so nothing is assumed.
 */
function textOf(res: unknown): string {
  if (res === null || typeof res !== "object" || !("content" in res)) return "";
  const { content } = res as { content: unknown };
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part === null || typeof part !== "object" || !("text" in part)) return "";
      const { text } = part as { text: unknown };
      return typeof text === "string" ? text : "";
    })
    .join("");
}

/**
 * FINDING 1 — symlink escape of the cwd containment boundary.
 * resolveWithin()/evaluate() are purely lexical (path.resolve, no realpath),
 * so an in-cwd symlink pointing outside cwd passes containment AND the
 * deny floor, and read_file defaults to `allow` — silent, unprompted read.
 */
test("REPRO 1: in-cwd symlink reads a secret outside cwd with decision=allow", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "okrepro-"));
  const cwd = path.join(root, "workspace");
  const outside = path.join(root, "outside");
  await import("node:fs/promises").then((fs) => fs.mkdir(cwd));
  await import("node:fs/promises").then((fs) => fs.mkdir(outside));

  const secretPath = path.join(outside, "id_rsa");
  // Marker assembled at runtime so the static secret scanner doesn't trip on
  // this canary fixture (it is not a real key).
  const keyMarker = `-----BEGIN ${"OPENSSH"} PRIVATE KEY-----`;
  await writeFile(secretPath, `${keyMarker}\nSECRET-OUTSIDE-CWD\n`);

  // Attacker-controlled symlink living inside cwd with an innocuous name.
  await symlink(secretPath, path.join(cwd, "notes.txt"));

  const decision = evaluate("read_file", { path: "notes.txt" }, cwd);
  const body = await callRead(cwd, "notes.txt");

  // FIXED BEHAVIOUR (inverted 2026-08-16, finding 1 fix): the symlink
  // resolves to its real outside-cwd target and is denied; the tool errors.
  assert.equal(decision, "deny", "policy engine denies the symlink escape");
  assert.match(body, /escapes working directory|Error/i, "no secret returned");
  assert.doesNotMatch(body, /SECRET-OUTSIDE-CWD/, "no exfiltration");

  await rm(root, { recursive: true, force: true });
});

/**
 * FINDING 2 — deny-floor escape via case variance on a case-insensitive
 * filesystem (macOS APFS/HFS+ default, Windows NTFS). The floor globs are
 * compiled case-sensitively, so ".ENV" misses the ".env" pattern while the
 * OS opens the very same file.
 */
test("REPRO 2: case-variant .ENV escapes the .env deny floor", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okrepro-case-"));
  await writeFile(path.join(cwd, ".env"), "OPENROUTER_API_KEY=sk-SECRET-ENV-VALUE\n");

  const denied = evaluate("read_file", { path: ".env" }, cwd);
  const escaped = evaluate("read_file", { path: ".ENV" }, cwd);

  assert.equal(denied, "deny", "control: exact-case .env is denied by the floor");
  // FIXED BEHAVIOUR (inverted 2026-08-16, finding 2 fix): floor matching is
  // case-insensitive + NFC-normalised, so .ENV is the same file as .env.
  assert.equal(escaped, "deny", "case-variant .ENV is denied by the floor");

  // Belt and braces: even if the engine were bypassed, no secret may return.
  const body = await callRead(cwd, ".ENV");
  assert.doesNotMatch(body, /sk-SECRET-ENV-VALUE/, "no secret read via case variance");

  await rm(cwd, { recursive: true, force: true });
});

/**
 * FINDING 3 — the deny floor's slashed patterns are not basename-matched, so
 * only a top-level .git/config is protected; a nested one is not.
 */
test("REPRO 3: nested .git/config is outside the deny floor", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okrepro-git-"));
  const top = evaluate("read_file", { path: ".git/config" }, cwd);
  const nested = evaluate("read_file", { path: "vendor/dep/.git/config" }, cwd);

  assert.equal(top, "deny", "control: top-level .git/config is denied");
  // FIXED BEHAVIOUR (inverted 2026-08-16, finding 3 fix): slashed floor
  // patterns match at any depth.
  assert.equal(nested, "deny", "nested .git/config is denied by the floor");

  await rm(cwd, { recursive: true, force: true });
});

/**
 * REGRESSION GUARDS (2026-08-16) — the floor is a tool-layer boundary, not
 * only a policy decision: read-only tools never consult evaluate(), so they
 * enforce the floor themselves via guardPath.
 */
test("GUARD: read_file refuses floor files at the tool layer", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okguard-"));
  await writeFile(path.join(cwd, ".env"), "SECRET=floor-test\n");
  try {
    const body = await callRead(cwd, ".env");
    assert.match(body, /denied — protected path/, "tool refuses the floor file");
    assert.doesNotMatch(body, /floor-test/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("GUARD: recursive grep never surfaces floor-file content", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okguard-grep-"));
  await writeFile(path.join(cwd, ".env"), "GREPPABLE_SECRET=1\n");
  await writeFile(path.join(cwd, "ok.txt"), "GREPPABLE_SECRET mentioned here\n");
  const sub = path.join(cwd, "sub");
  await import("node:fs/promises").then((fs) => fs.mkdir(sub));
  await writeFile(path.join(sub, ".env"), "GREPPABLE_SECRET=2\n");
  try {
    const grep = readOnlyTools(cwd).find((t) => t.name === "grep");
    assert.ok(grep);
    const res: any = await grep.execute("t1", { pattern: "GREPPABLE_SECRET" } as any);
    const body = res.content.map((c: any) => c.text).join("");
    assert.match(body, /ok\.txt/, "legitimate matches still surface");
    assert.equal((body.match(/GREPPABLE_SECRET=\d/g) ?? []).length, 0, "no floor-file lines leak");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// RE-REVIEW 2026-08-16 (cole@openkai) — E001 §2 gate, second pass.
//
// Verified the 09b56ce + 3f89a45 fixes (REPRO 1-3 above now assert `deny`),
// then attacked the rest of the §2 table. Three NEW live classes are proved
// below by REPRO 4-6. Per the file's convention those assert the CURRENT
// (vulnerable) behaviour so they pass on this tree and prove the exploit —
// INVERT ON FIX (flip to expect deny/refusal), same as REPRO 1-3 were.
// The HELD-* tests below are regression guards: they must never flip.
// ══════════════════════════════════════════════════════════════════════════

/**
 * FINDING 4 (HIGH, LIVE) — deny-floor blind spot: a protected NAME used as a
 * DIRECTORY component is unprotected. `pathGlobMatch` matches a bare-name
 * pattern against the whole relpath or the BASENAME only, so `.env/production`
 * (basename `production`) misses the `.env` floor entirely. read_file returns
 * decision=allow — a silent, unprompted secret read. `.env/` directories are a
 * real convention (per-environment files), and the same hole applies to
 * `*.pem` / `*.key` used as directory names.
 *
 * FIXED (2026-08-16, F4): `matchesDenyFloor` tests every ANCESTOR PREFIX, so a
 * protected path protects its descendants. That covers the bare-name case
 * (`.env/production`) and the slashed one the original note missed
 * (`server.pem/privkey` — the `*.pem` pattern never matched it either).
 */
test("REPRO 4: a protected name used as a DIRECTORY is denied by the floor", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okrepro-floordir-"));
  try {
    await mkdir(path.join(cwd, ".env"));
    await writeFile(path.join(cwd, ".env", "production"), "DB_PASSWORD=hunter2\n");
    await mkdir(path.join(cwd, "server.pem"));
    await writeFile(path.join(cwd, "server.pem", "privkey"), "PRIVATE-MATERIAL\n");

    // Control: the floor still works when the secret is a leaf file.
    assert.equal(evaluate("read_file", { path: ".env" }, cwd), "deny", "control: .env denied");

    // FIXED: the same name as a directory is covered by the same pattern.
    assert.equal(
      evaluate("read_file", { path: ".env/production" }, cwd),
      "deny",
      ".env/production is denied by the engine",
    );
    assert.equal(
      evaluate("read_file", { path: "server.pem/privkey" }, cwd),
      "deny",
      "server.pem/privkey is denied by the engine",
    );

    // …and the tool layer refuses rather than disclosing.
    const body = await callRead(cwd, ".env/production");
    assert.match(body, /denied — protected path/, "tool refuses the floor directory");
    assert.doesNotMatch(body, /DB_PASSWORD=hunter2/, "no secret is disclosed");
    assert.doesNotMatch(
      await callRead(cwd, "server.pem/privkey"),
      /PRIVATE-MATERIAL/,
      "no key material is disclosed",
    );

    // Contrast: the slashed `**/.ssh/**` pattern DOES cover descendants —
    // this is why the bare-name patterns are the defect, not the floor idea.
    await mkdir(path.join(cwd, "deploy", ".ssh"), { recursive: true });
    await writeFile(path.join(cwd, "deploy", ".ssh", "authorized_keys"), "ssh-rsa AAAA\n");
    assert.equal(
      evaluate("read_file", { path: "deploy/.ssh/authorized_keys" }, cwd),
      "deny",
      "slashed floor patterns already cover descendants",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

/**
 * FINDING 5 (MEDIUM, LIVE) — `edit_file` reads the target BEFORE consulting the
 * gate (tools.ts: `fs.readFile(abs)` + `countOccurrences` precede
 * `gate.request`), so its error text is a confirmed-guess oracle over files the
 * caller may never read: a correct guess returns "Permission denied", a wrong
 * one returns "oldString not found", and the ambiguous branch leaks a match
 * COUNT. No `permission_request` is emitted, so the operator never sees it.
 *
 * FIXED (2026-08-16, F5): `guardPath` resolves + floor/containment-checks
 * BEFORE any read, so both probes return an identical, path-derived refusal.
 */
test("REPRO 5: edit_file refuses floor files identically regardless of the guess", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okrepro-oracle-"));
  try {
    await writeFile(path.join(cwd, ".env"), "OPENROUTER_API_KEY=sk-live-ORACLE-9f3a\n");
    const gate = autoGate(cwd, "reject"); // operator refuses everything
    const edit = gatedTool(cwd, gate, "edit_file");

    const correct = textOf(
      await edit.execute("o1", { path: ".env", oldString: "sk-live-ORACLE-9f3a", newString: "x" }),
    );
    const wrong = textOf(
      await edit.execute("o2", { path: ".env", oldString: "sk-live-WRONGGUESS", newString: "x" }),
    );

    // FIXED: the two replies are identical, so there is nothing to learn.
    assert.equal(correct, wrong, "correct vs wrong guess are indistinguishable");
    assert.match(correct, /Permission denied/, "both are refusals");
    assert.match(correct, /protected path/, "…from the floor, derived from the path alone");
    assert.doesNotMatch(
      correct + wrong,
      /oldString not found|matches\)/,
      "no read-derived error text — the file was never opened",
    );

    // The floor still stops the WRITE — confidentiality leaks, integrity holds.
    assert.match(await callRead(cwd, ".env"), /denied — protected path/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

/** FINDING 5b (FIXED) — the same probe aimed outside cwd leaks nothing either. */
test("REPRO 5b: edit_file leaks no content/existence outside cwd", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "okrepro-oracle2-"));
  const cwd = path.join(root, "ws");
  try {
    await mkdir(cwd);
    await writeFile(path.join(root, "secret.txt"), "TOPSECRET-OUTSIDE\n");
    const gate = autoGate(cwd, "reject");
    const edit = gatedTool(cwd, gate, "edit_file");

    const correct = textOf(
      await edit.execute("p1", {
        path: "../secret.txt",
        oldString: "TOPSECRET-OUTSIDE",
        newString: "x",
      }),
    );
    const wrong = textOf(
      await edit.execute("p2", {
        path: "../secret.txt",
        oldString: "NOPE-NOT-PRESENT",
        newString: "x",
      }),
    );

    assert.equal(correct, wrong, "outside-cwd content is not probeable");
    assert.match(correct, /Permission denied/, "both are refusals");
    assert.match(correct, /escapes working directory/, "…from containment, path-derived");
    assert.doesNotMatch(
      correct + wrong,
      /oldString not found|matches\)/,
      "the outside-cwd file was never read",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * FINDING 6 (MEDIUM, LIVE) — the §2 "TUI rendering" row: model output is
 * appended to the transcript with no escape filtering, so a hostile model turn
 * drives the operator's terminal — OSC 52 writes the clipboard, OSC 0 rewrites
 * the window title, CSI 2J clears the screen (erasing evidence), and SGR text
 * can forge the approval chrome the consent model depends on.
 *
 * INVERT ON FIX: strip/neutralise C0, CSI and OSC sequences from model text
 * before it reaches a component.
 */
test("REPRO 6: model output injects raw ANSI/OSC escapes into the terminal", () => {
  const transcript = new Transcript("openkai");
  const hostile =
    "Here is your answer.\n" +
    "\x1b]52;c;aHR0cHM6Ly9hdHRhY2tlci5leGFtcGxlL3B3bg==\x07" + // clipboard write
    "\x1b]0;PWNED-WINDOW-TITLE\x07" + // window title
    "\x1b[2J\x1b[H" + // clear screen + home
    "\x1b[38;5;46m✔ Allow always — approved by operator\x1b[39m\n"; // forged chrome

  transcript.applyEvent({ kind: "connected" });
  transcript.applyEvent({ kind: "delta", field: "text", delta: hostile });
  transcript.applyEvent({ kind: "turn_end" });
  const frame = transcript.render(80).join("\n");

  // FIXED (2026-08-16, sanitizeTerminalText at the transcript boundary): no
  // control sequence survives into the rendered frame.
  assert.ok(!frame.includes("\x1b]52;"), "OSC 52 clipboard write is stripped");
  assert.ok(!frame.includes("\x1b]0;"), "OSC 0 title rewrite is stripped");
  assert.ok(!frame.includes("\x1b[2J"), "CSI 2J screen clear is stripped");
  assert.ok(!frame.includes("\x07"), "raw BEL is stripped");
  // The printable text content survives — sanitisation alters only controls.
  assert.match(frame, /Here is your answer\./);
  // The forged chrome line loses its SGR but its text remains visible as
  // ordinary model output — it can no longer impersonate the real overlay
  // (the genuine overlay renders from components, not transcript text).
  assert.ok(!frame.includes("\x1b[38;5;46m"), "forged chrome styling is stripped");
});

// ── HELD regression guards (verified 2026-08-16; must never flip) ───────────

/** Handoff item 4 — a write routed through a symlinked parent stays in cwd. */
test("HELD: write_file through a symlinked parent dir cannot land outside cwd", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "okheld-wsym-"));
  const cwd = path.join(root, "ws");
  const outside = path.join(root, "outside");
  try {
    await mkdir(cwd);
    await mkdir(outside);
    await symlink(outside, path.join(cwd, "public"));

    const { decision, reason } = evaluateWithReason(
      "write_file",
      { path: "public/pwned.txt", content: "X" },
      cwd,
    );
    assert.equal(decision, "deny", "engine denies the symlinked-parent write");
    assert.match(reason, /outside working directory/);

    const gate = autoGate(cwd, "once"); // even a consenting operator cannot help
    const body = textOf(
      await gatedTool(cwd, gate, "write_file").execute("w1", {
        path: "public/pwned.txt",
        content: "PWNED-OUTSIDE-CWD",
      }),
    );
    assert.match(body, /Permission denied/, "tool refuses");
    await assert.rejects(
      () => readFile(path.join(outside, "pwned.txt"), "utf-8"),
      "nothing landed outside cwd",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** Handoff item 4 — the same guard for edit_file's write side. */
test("HELD: edit_file through a symlinked parent dir cannot tamper outside cwd", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "okheld-esym-"));
  const cwd = path.join(root, "ws");
  const outside = path.join(root, "outside");
  try {
    await mkdir(cwd);
    await mkdir(outside);
    const victim = path.join(outside, "victim.txt");
    await writeFile(victim, "KEEPME original\n");
    await symlink(outside, path.join(cwd, "public"));

    const gate = autoGate(cwd, "once");
    const body = textOf(
      await gatedTool(cwd, gate, "edit_file").execute("e1", {
        path: "public/victim.txt",
        oldString: "KEEPME original",
        newString: "TAMPERED",
      }),
    );
    assert.match(body, /Permission denied/, "tool refuses");
    assert.doesNotMatch(await readFile(victim, "utf-8"), /TAMPERED/, "outside file untouched");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** §2 "Rule-ordering bypass" — the floor precedes the rule walk. */
test("HELD: no allow rule can override the deny floor", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okheld-order-"));
  try {
    await writeFile(path.join(cwd, ".env"), "SECRET=1\n");
    const attacker = [
      { tool: "read_file", path: "**", decision: "allow" as const, label: "wildcard" },
      { tool: "read_file", path: ".env", decision: "allow" as const, label: "explicit-env" },
    ];
    assert.equal(
      evaluate("read_file", { path: ".env" }, cwd, attacker),
      "deny",
      "two attacker allow rules incl. an explicit .env rule still deny",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

/** §2 "always-cache poisoning" — the floor is checked before the cache. */
test("HELD: an always-approval cannot be replayed onto a floor path", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okheld-cache-"));
  try {
    await writeFile(path.join(cwd, ".env"), "SECRET=cache\n");
    const gate = autoGate(cwd, "always");
    const write = gatedTool(cwd, gate, "write_file");

    // Seed the session `always` cache with a benign approved write.
    assert.match(
      textOf(await write.execute("c1", { path: "benign.txt", content: "hello" })),
      /Wrote benign\.txt/,
    );
    // The floor path must still be refused, cache notwithstanding.
    assert.match(
      textOf(await write.execute("c2", { path: ".env", content: "SECRET=overwritten" })),
      /Permission denied/,
    );
    assert.doesNotMatch(await readFile(path.join(cwd, ".env"), "utf-8"), /overwritten/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

/** §2 "bash obfuscation" — bash can never be auto-allowed, however written. */
test("HELD: bash is never auto-allowed, even with an explicit allow rule", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okheld-bash-"));
  try {
    const attacker = [{ tool: "bash", decision: "allow" as const, label: "attacker-bash" }];
    assert.equal(evaluate("bash", { command: "cat .env" }, cwd, attacker), "ask");
    assert.equal(
      evaluate("bash", { command: 'c""at $(printf "\\056")env | base64' }, cwd, attacker),
      "ask",
      "obfuscated command still only reaches `ask`",
    );
    assert.equal(
      evaluate("bash", { command: "cat", path: "benign.txt" }, cwd, attacker),
      "ask",
      "a path arg does not route bash through the file-tool branch",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

/** Handoff item 5 breadth — the read-only trio cannot follow a symlinked dir. */
test("HELD: list_files and grep cannot escape via a symlinked directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "okheld-ls-"));
  const cwd = path.join(root, "ws");
  const outside = path.join(root, "outside");
  try {
    await mkdir(cwd);
    await mkdir(outside);
    await writeFile(path.join(outside, "loot.txt"), "OUTSIDE-LOOT-LINE\n");
    await symlink(outside, path.join(cwd, "docs"));

    const list = readOnlyTools(cwd).find((t) => t.name === "list_files")!;
    const grep = readOnlyTools(cwd).find((t) => t.name === "grep")!;

    assert.match(
      textOf(await list.execute("l1", { path: "docs" })),
      /escapes working directory/,
      "list_files refuses the symlinked dir",
    );
    assert.doesNotMatch(
      textOf(await grep.execute("g1", { pattern: "OUTSIDE-LOOT-LINE" })),
      /OUTSIDE-LOOT-LINE/,
      "recursive grep does not follow it",
    );
    assert.doesNotMatch(
      textOf(await grep.execute("g2", { pattern: "OUTSIDE-LOOT-LINE", path: "docs" })),
      /OUTSIDE-LOOT-LINE/,
      "targeted grep does not follow it either",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** Finding-2 breadth — the whole case/normalisation family stays denied. */
test("HELD: every case variant of the .env floor is denied", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okheld-variants-"));
  try {
    await writeFile(path.join(cwd, ".env"), "SECRET=variants\n");
    for (const variant of [".ENV", ".Env", ".eNv", "./.ENV", "sub/../.ENV", ".env.local", ".ENV.LOCAL"]) {
      assert.equal(
        evaluate("read_file", { path: variant }, cwd),
        "deny",
        `${variant} must be denied by the floor`,
      );
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

/**
 * FINDING 7 (MEDIUM, LIVE) — §2 "Session persistence" row: SECURITY.md §4 states
 * secrets must live only in `.env` and "never in Cortex memory, sessions,
 * artifacts, or transcripts", but no redaction layer exists anywhere in
 * `persist/` or `cortex/` — whatever reaches a turn is written verbatim. Worse,
 * the session tree is created with default permissions, so on a shared host the
 * transcript is readable by every local user.
 *
 * FIXED (2026-08-16, F7): §4 is kept as written rather than weakened — the
 * single JSONL write seam redacts secret-shaped spans (so every entry kind is
 * covered), and the tree is created 0700/0600.
 */
test("REPRO 7: session persistence redacts secrets and is owner-only", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "okrepro-persist-"));
  try {
    const store = new SessionStore({ root, sessionId: "11111111-1111-7111-8111-111111111111" });
    await store.ensure();
    // An approved `bash cat .env` (ADR §5.6: execution is not a sandbox) puts
    // real secret material into the turn — this is the realistic path.
    await store.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "OPENROUTER_API_KEY=sk-live-PERSISTED-7c21" }],
      timestamp: 1,
    } as never);

    const onDisk = await readFile(store.filePath, "utf-8");
    assert.doesNotMatch(onDisk, /sk-live-PERSISTED-7c21/, "secret is not persisted verbatim");
    assert.match(onDisk, /\[redacted-secret\]/, "the span is replaced, not silently dropped");
    // The surrounding turn survives — redaction is span-level, not entry-level.
    assert.match(onDisk, /OPENROUTER_API_KEY=/, "the rest of the message is intact");
    // Still valid JSONL after redaction.
    assert.equal((await store.readEntries()).length, 1, "the entry still parses");

    // Owner-only on the session file and its directory.
    const fileMode = (await stat(store.filePath)).mode & 0o777;
    const dirMode = (await stat(path.dirname(store.filePath))).mode & 0o777;
    assert.equal(fileMode & 0o077, 0, `session file is owner-only (${fileMode.toString(8)})`);
    assert.equal(dirMode & 0o077, 0, `session dir is owner-only (${dirMode.toString(8)})`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * §2 "Shadow-git undo" row — restore-path escape. `undo()` deletes files git
 * reports as added between the two snapshots; the containment check is lexical
 * (`path.resolve` + `startsWith`) rather than canonical, so this guard proves
 * the escape is not reachable: git records a symlink as a symlink and never
 * descends it, and the non-recursive `rm` unlinks the link, not the target.
 */
test("HELD: shadow-git undo cannot delete outside cwd via a symlinked dir", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "okheld-undo-"));
  const cwd = path.join(root, "ws");
  const outside = path.join(root, "outside");
  try {
    await mkdir(cwd);
    await mkdir(outside);
    const precious = path.join(outside, "precious.txt");
    await writeFile(precious, "MUST-SURVIVE-UNDO\n");

    const shadow = new ShadowGit(cwd);
    await writeFile(path.join(cwd, "base.txt"), "base\n");
    await shadow.snapshot("baseline");

    // Between snapshots the agent plants a symlink to the outside directory
    // plus a file reached through it — undo must not follow either.
    await symlink(outside, path.join(cwd, "escape"));
    await writeFile(path.join(cwd, "added.txt"), "added\n");
    await shadow.snapshot("with-escape");

    await shadow.undo();

    assert.equal(await readFile(precious, "utf-8"), "MUST-SURVIVE-UNDO\n", "outside file survives");
    await assert.rejects(
      () => readFile(path.join(cwd, "added.txt"), "utf-8"),
      "in-cwd added file is rolled back",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// THIRD PASS 2026-08-16 — verifying the F6 fix (`1d46b35`, sanitizeTerminalText).
// The sanitiser is sound where it is applied (streamed deltas, thinking,
// replay, user paste, tool results all render clean), but it is NOT applied at
// every boundary. REPRO 8/9 prove the residue. Both assert the CURRENT
// behaviour — INVERT ON FIX.
// ══════════════════════════════════════════════════════════════════════════

/** The hostile payload: clipboard write, screen clear, and chrome-colour SGR. */
const TERM_PAYLOAD = "\x1b]52;c;cHduZWQ=\x07\x1b[2J\x1b[38;5;46m";

/**
 * FINDING 6b (HIGH, LIVE) — the CONSENT SURFACE is unsanitised. `PermissionOverlay`
 * renders model-supplied strings (bash command, diff path, diff body, tool name)
 * straight to the terminal. ADR §5.6 is explicit that execution is not a sandbox
 * and the permission engine IS the control, so an overlay whose displayed text the
 * model controls defeats informed consent: CSI 2J blanks the frame, SGR forges the
 * approval chrome, and CR/backspace can rewrite the command the operator is reading
 * while a different one is approved.
 *
 * This is the same defect class as F6 but on the one surface that must never be
 * spoofable — hence HIGH rather than MEDIUM.
 *
 * FIXED (2026-08-16, F6b): every overlay field goes through
 * `sanitizeTerminalText`; single-line fields also lose newlines, so a payload
 * cannot fabricate an extra line of chrome inside the frame.
 */
test("REPRO 8: the permission overlay strips model-supplied escapes", () => {
  const fields: Array<[string, PermissionOverlay]> = [
    [
      "bash command preview",
      new PermissionOverlay({
        toolName: "bash",
        rule: "ask — bash requires approval",
        preview: { kind: "command", command: TERM_PAYLOAD, cwd: "/p" },
        onDecision: () => {},
      }),
    ],
    [
      "diff path",
      new PermissionOverlay({
        toolName: "write_file",
        rule: "ask",
        preview: { kind: "diff", path: TERM_PAYLOAD, before: "a", after: "b" },
        onDecision: () => {},
      }),
    ],
    [
      "diff body",
      new PermissionOverlay({
        toolName: "write_file",
        rule: "ask",
        preview: { kind: "diff", path: "/p/a.txt", before: "a", after: TERM_PAYLOAD },
        onDecision: () => {},
      }),
    ],
    [
      "tool name",
      new PermissionOverlay({
        toolName: TERM_PAYLOAD,
        rule: "ask",
        preview: { kind: "diff", path: "/p/a.txt", before: "a", after: "b" },
        onDecision: () => {},
      }),
    ],
  ];

  for (const [label, overlay] of fields) {
    const frame = overlay.render(80).join("\n");
    assert.ok(!frame.includes("\x1b]52;"), `${label}: OSC 52 clipboard write is stripped`);
    assert.ok(!frame.includes("\x1b[2J"), `${label}: CSI 2J screen clear is stripped`);
    assert.ok(!frame.includes("\x07"), `${label}: raw BEL is stripped`);
  }

  // The overlay still renders its own chrome — sanitisation is not a blanket
  // strip of the component's theme colours, only of the model's text.
  const control = new PermissionOverlay({
    toolName: "bash",
    rule: "ask — bash requires approval",
    preview: { kind: "command", command: "ls -la", cwd: "/p" },
    onDecision: () => {},
  }).render(80).join("\n");
  assert.match(control, /ls -la/, "the real command is still shown");
  assert.match(control, /Allow once/, "the approval actions still render");

  // A newline in a single-line field cannot forge an extra frame line.
  const forged = new PermissionOverlay({
    toolName: "bash",
    rule: "ask",
    preview: { kind: "command", command: "rm -rf /\n✔ Allow always — approved", cwd: "/p" },
    onDecision: () => {},
  }).render(80);
  const forgedLine = forged.find((l) => l.includes("Allow always — approved"));
  assert.ok(forgedLine !== undefined, "the payload text is still shown to the operator");
  assert.match(
    forgedLine,
    /rm -rf \//,
    "…on the command's own line, not as a separate forged chrome line",
  );
});

/**
 * FINDING 6c (MEDIUM, LIVE) — the transcript sanitiser misses two entry points.
 * `tool_call` renders the tool NAME and top-level ARG VALUES unsanitised, and both
 * are model-chosen, so the F6 channel is reinstated on every tool call. The `/btw`
 * question header is also unsanitised while `addUserMessage` is not — an internal
 * inconsistency worth closing even though that text is operator-supplied.
 *
 * FIXED (2026-08-16, F6c): the tool card sanitises both the name and each
 * arg key/value, and `btwBody` sanitises the question.
 */
test("REPRO 9: tool_call name/args and the btw header are sanitised", () => {
  // Control: the paths kai fixed really are clean — this must keep passing.
  const clean = new Transcript("openkai");
  clean.applyEvent({ kind: "connected" });
  clean.applyEvent({ kind: "delta", field: "text", delta: TERM_PAYLOAD });
  clean.applyEvent({ kind: "turn_end" });
  const cleanFrame = clean.render(80).join("\n");
  assert.ok(!cleanFrame.includes("\x1b]52;"), "control: streamed deltas are sanitised");

  // FIXED: model-chosen arg values — and arg KEYS, equally model-chosen.
  const viaArgs = new Transcript("openkai");
  viaArgs.applyEvent({
    kind: "tool_call",
    toolCallId: "a1",
    toolName: "read_file",
    args: { path: TERM_PAYLOAD, [`k${TERM_PAYLOAD}`]: "v" },
  });
  const argsFrame = viaArgs.render(80).join("\n");
  assert.ok(!argsFrame.includes("\x1b]52;"), "tool arg values/keys are sanitised");
  assert.ok(!argsFrame.includes("\x1b[2J"), "…including the screen clear");
  assert.match(argsFrame, /read_file/, "the card still renders");

  // FIXED: so is a model-chosen tool name.
  const viaName = new Transcript("openkai");
  viaName.applyEvent({
    kind: "tool_call",
    toolCallId: "a2",
    toolName: TERM_PAYLOAD,
    args: { path: "ok.txt" },
  });
  assert.ok(
    !viaName.render(80).join("\n").includes("\x1b]52;"),
    "the tool name is sanitised",
  );

  // FIXED: the btw question header now matches addUserMessage.
  const viaBtw = new Transcript("openkai");
  viaBtw.beginBtwTurn(TERM_PAYLOAD);
  assert.ok(
    !viaBtw.render(80).join("\n").includes("\x1b]52;"),
    "the btw question header is sanitised",
  );
});
