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
import { mkdtemp, rm, writeFile, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { evaluate, readOnlyTools } from "@openkai/core";

function readTool(cwd: string) {
  const t = readOnlyTools(cwd).find((x) => x.name === "read_file");
  assert.ok(t, "read_file tool must exist");
  return t!;
}

async function callRead(cwd: string, p: string): Promise<string> {
  const res: any = await readTool(cwd).execute("t1", { path: p } as any);
  return res.content.map((c: any) => c.text).join("");
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
  await writeFile(secretPath, "-----BEGIN OPENSSH PRIVATE KEY-----\nSECRET-OUTSIDE-CWD\n");

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
