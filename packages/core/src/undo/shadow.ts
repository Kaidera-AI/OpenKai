/**
 * Shadow-git undo (opencode pattern, OK-5 feature floor).
 *
 * A second git repository whose GIT_DIR lives at `<cwd>/.openkai/shadow.git`
 * (gitignored) and whose work tree IS the project directory. Snapshots are
 * full-tree commits taken before gated mutations; undo walks the shadow
 * HEAD back and restores the work tree — the operator's real git history is
 * never touched.
 *
 * Ported semantics from opencode's `packages/opencode/src/snapshot/index.ts`:
 * separate git dir, `objects/info/alternates` pointing at the project repo
 * (object sharing, no duplication), full-tree snapshot commits. Differences:
 * no 2 MiB file cap and no 7-day prune yet (recorded as follow-ups; the
 * shadow dir is local state the operator can delete).
 *
 * Two hard-won boundary rules:
 *  1. The child env strips every inherited GIT_* variable before applying
 *     the shadow identity — an inherited GIT_INDEX_FILE/GIT_DIR would
 *     redirect shadow ops into the operator's real repo.
 *  2. Snapshots use `git add -A -f` with an explicit `.openkai` pathspec
 *     exclude, so GITIGNORED mutations (.env, dist/) are captured and
 *     undo() can restore them — undo that silently skips the very files a
 *     gated run is most likely to touch is not undo.
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SHADOW_ENV = {
  GIT_AUTHOR_NAME: "openkai",
  GIT_AUTHOR_EMAIL: "openkai@localhost",
  GIT_COMMITTER_NAME: "openkai",
  GIT_COMMITTER_EMAIL: "openkai@localhost",
};

export interface ShadowSnapshot {
  sha: string;
  message: string;
}

export class ShadowGitError extends Error {
  override readonly name = "ShadowGitError";
}

export class ShadowGit {
  readonly cwd: string;
  readonly gitDir: string;

  constructor(cwd: string) {
    this.cwd = path.resolve(cwd);
    this.gitDir = path.join(this.cwd, ".openkai", "shadow.git");
  }

  private async git(args: string[]): Promise<string> {
    // The child env is the operator's MINUS every GIT_* variable, plus the
    // shadow identity. An inherited GIT_INDEX_FILE / GIT_DIR / GIT_WORK_TREE
    // (a parent git hook, a `git -c …` wrapper, direnv) would silently
    // redirect shadow operations into the operator's real repository — the
    // one thing this class exists to never touch.
    const env: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (name.startsWith("GIT_")) continue;
      env[name] = value;
    }
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["--git-dir", this.gitDir, "--work-tree", this.cwd, ...args],
        { env: { ...env, ...SHADOW_ENV }, maxBuffer: 16 * 1024 * 1024 },
      );
      return stdout.trim();
    } catch (error) {
      let detail: string;
      if (error && typeof error === "object" && "stderr" in error) {
        const stderr = error.stderr;
        detail =
          typeof stderr === "string" && stderr.trim().length > 0
            ? stderr.trim()
            : error instanceof Error
              ? error.message
              : String(error);
      } else {
        detail = error instanceof Error ? error.message : String(error);
      }
      throw new ShadowGitError(`git ${args[0]} failed: ${detail}`);
    }
  }

  private async head(): Promise<string | undefined> {
    try {
      return await this.git(["rev-parse", "HEAD"]);
    } catch {
      return undefined; // no commits yet
    }
  }

  /** Idempotent: initialises the shadow repo + alternates on first use. */
  async init(): Promise<void> {
    const exists = await fs
      .stat(path.join(this.gitDir, "HEAD"))
      .then(() => true)
      .catch(() => false);
    if (exists) return;

    await fs.mkdir(this.gitDir, { recursive: true });
    await this.git(["init"]);

    // The shadow dir lives INSIDE the work tree: it must never track itself.
    // Repo-local exclude (invisible to the operator's .gitignore) — without
    // this, snapshots self-include the object store and undo deletes it.
    const infoDir = path.join(this.gitDir, "info");
    await fs.mkdir(infoDir, { recursive: true });
    await fs.writeFile(path.join(infoDir, "exclude"), ".openkai/\n", "utf-8");

    // Object sharing with the operator's repo, when there is one.
    const projectObjects = path.join(this.cwd, ".git", "objects");
    const hasProjectRepo = await fs
      .stat(projectObjects)
      .then((s) => s.isDirectory())
      .catch(() => false);
    if (hasProjectRepo) {
      const alternates = path.join(this.gitDir, "objects", "info");
      await fs.mkdir(alternates, { recursive: true });
      await fs.writeFile(path.join(alternates, "alternates"), `${projectObjects}\n`, "utf-8");
    }
  }

  /**
   * Commit the full current tree. Returns the snapshot sha, or the current
   * HEAD unchanged when the tree is clean (snapshots are idempotent).
   *
   * `add -A -f` is deliberate: undo must restore what a gated mutation
   * changed, and mutations do not respect .gitignore — a builder that edits
   * `.env` or writes into `dist/` must be undoable. The pathspec exclude on
   * `.openkai` replaces the protection -f strips from the info/exclude rule
   * (verified: -f overrides BOTH .gitignore and info/exclude, so without the
   * pathspec the shadow would snapshot its own object store).
   */
  async snapshot(message: string): Promise<ShadowSnapshot> {
    await this.init();
    await this.git(["add", "-A", "-f", "--", ".", ":(exclude).openkai"]);
    const head = await this.head();
    const dirty = await this.git(["status", "--porcelain"]).then((s) => s.length > 0);
    if (!dirty && head) return { sha: head, message: "unchanged" };
    await this.git(["commit", "--allow-empty", "-m", message]);
    const sha = await this.head();
    if (!sha) throw new ShadowGitError("snapshot produced no commit");
    return { sha, message };
  }

  /**
   * Walk the shadow HEAD back one snapshot and restore the work tree to it:
   * tracked content is checked out; files created after the target snapshot
   * are deleted. Returns the restored sha. Throws when there is nothing to
   * undo. Redo is out of scope: a new snapshot after an undo starts a new line.
   */
  async undo(): Promise<ShadowSnapshot> {
    await this.init();
    const head = await this.head();
    if (!head) throw new ShadowGitError("nothing to undo — no snapshots");
    const parent = await this.git(["rev-parse", "HEAD~1"]).catch(() => undefined);
    if (!parent) throw new ShadowGitError("nothing to undo — at the first snapshot");

    // Files added between parent and HEAD must be deleted from the work tree.
    const added = await this.git([
      "diff",
      "--name-only",
      "--diff-filter=A",
      `${parent}..${head}`,
    ]);
    await this.git(["checkout", parent, "--", "."]);
    for (const rel of added.split("\n").filter((line) => line.length > 0)) {
      if (rel === ".openkai" || rel.startsWith(".openkai/")) continue; // never our own state
      const target = path.resolve(this.cwd, rel);
      if (!target.startsWith(this.cwd + path.sep)) continue; // never outside cwd
      await fs.rm(target, { force: true });
    }
    await this.git(["reset", "--soft", "HEAD~1"]);
    return { sha: parent, message: "undo" };
  }

  /** Snapshot history, newest first. */
  async history(limit = 20): Promise<ShadowSnapshot[]> {
    await this.init();
    const head = await this.head();
    if (!head) return [];
    const out = await this.git([
      "log",
      `-${Math.max(1, limit)}`,
      "--format=%H%x00%s",
    ]);
    return out
      .split("\n")
      .filter((line) => line.includes("\0"))
      .map((line) => {
        const separator = line.indexOf("\0");
        return {
          sha: line.slice(0, separator),
          message: line.slice(separator + 1),
        };
      });
  }
}
