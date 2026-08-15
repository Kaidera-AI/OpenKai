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

  // VULNERABLE BEHAVIOUR (invert after fix -> "deny" / no secret):
  assert.equal(decision, "allow", "policy engine allows the symlink read");
  assert.match(body, /SECRET-OUTSIDE-CWD/, "secret outside cwd was exfiltrated");

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
  // VULNERABLE BEHAVIOUR (invert after fix -> "deny"):
  assert.equal(escaped, "allow", "case-variant .ENV escapes the deny floor");

  // Prove the OS resolves .ENV to the same file (case-insensitive FS only).
  const entries = await readdir(cwd);
  assert.ok(entries.includes(".env"));
  let caseInsensitive = true;
  let body = "";
  try {
    body = await callRead(cwd, ".ENV");
    if (/Error reading/.test(body)) caseInsensitive = false;
  } catch {
    caseInsensitive = false;
  }
  if (caseInsensitive) {
    assert.match(body, /sk-SECRET-ENV-VALUE/, "secret read despite the deny floor");
  }

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
  // VULNERABLE BEHAVIOUR (invert after fix -> "deny"):
  assert.equal(nested, "allow", "nested .git/config escapes the floor");

  await rm(cwd, { recursive: true, force: true });
});
