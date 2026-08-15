/**
 * Shadow-git undo tests (Inc 05). All git operations run inside mkdtemp temp
 * dirs; the operator's real repo is never touched.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ShadowGit, ShadowGitError } from "@openkai/core";

async function tempProject(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-shadow-"));
  await writeFile(path.join(cwd, "a.txt"), "original a\n", "utf-8");
  return cwd;
}

test("snapshot commits the full tree and is idempotent when clean", async () => {
  const cwd = await tempProject();
  try {
    const shadow = new ShadowGit(cwd);
    const first = await shadow.snapshot("before write_file: a.txt");
    assert.ok(first.sha.length >= 8);
    const again = await shadow.snapshot("before write_file: a.txt");
    assert.equal(again.sha, first.sha);
    assert.equal(again.message, "unchanged");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("undo restores modified content", async () => {
  const cwd = await tempProject();
  try {
    const shadow = new ShadowGit(cwd);
    await shadow.snapshot("baseline");
    await writeFile(path.join(cwd, "a.txt"), "mutated a\n", "utf-8");
    await shadow.snapshot("before edit_file: a.txt");
    const restored = await shadow.undo();
    assert.equal(await readFile(path.join(cwd, "a.txt"), "utf-8"), "original a\n");
    assert.ok(restored.sha.length >= 8);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("undo deletes files created after the target snapshot", async () => {
  const cwd = await tempProject();
  try {
    const shadow = new ShadowGit(cwd);
    await shadow.snapshot("baseline");
    await writeFile(path.join(cwd, "new.txt"), "brand new\n", "utf-8");
    await shadow.snapshot("before write_file: new.txt");
    await shadow.undo();
    await assert.rejects(readFile(path.join(cwd, "new.txt"), "utf-8"));
    assert.equal(await readFile(path.join(cwd, "a.txt"), "utf-8"), "original a\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("undo walks back multiple snapshots in order", async () => {
  const cwd = await tempProject();
  try {
    const shadow = new ShadowGit(cwd);
    await shadow.snapshot("v0");
    await writeFile(path.join(cwd, "a.txt"), "v1\n", "utf-8");
    await shadow.snapshot("v1");
    await writeFile(path.join(cwd, "a.txt"), "v2\n", "utf-8");
    await shadow.snapshot("v2");
    await shadow.undo();
    assert.equal(await readFile(path.join(cwd, "a.txt"), "utf-8"), "v1\n");
    await shadow.undo();
    assert.equal(await readFile(path.join(cwd, "a.txt"), "utf-8"), "original a\n");
    await assert.rejects(shadow.undo(), (error: unknown) => {
      assert.ok(error instanceof ShadowGitError);
      assert.match(error.message, /first snapshot/);
      return true;
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("history lists snapshots newest-first with messages", async () => {
  const cwd = await tempProject();
  try {
    const shadow = new ShadowGit(cwd);
    await shadow.snapshot("first");
    await writeFile(path.join(cwd, "b.txt"), "b\n", "utf-8");
    await shadow.snapshot("second");
    const history = await shadow.history();
    assert.equal(history.length, 2);
    assert.equal(history[0]?.message, "second");
    assert.equal(history[1]?.message, "first");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("undo on a fresh project throws ShadowGitError, not a git error", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-shadow-"));
  try {
    const shadow = new ShadowGit(cwd);
    await assert.rejects(shadow.undo(), (error: unknown) => {
      assert.ok(error instanceof ShadowGitError);
      assert.match(error.message, /no snapshots/);
      return true;
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
