/**
 * openkai undo — restore the work tree to the previous shadow snapshot
 * (Inc 05; opencode shadow-git pattern via ShadowGit).
 */

import { ShadowGit, ShadowGitError } from "@openkai/core";

export interface UndoOptions {
  history: boolean;
}

export async function runUndo(options: UndoOptions): Promise<number> {
  const shadow = new ShadowGit(process.cwd());
  try {
    if (options.history) {
      const entries = await shadow.history();
      if (entries.length === 0) {
        process.stdout.write("no snapshots yet\n");
        return 0;
      }
      for (const entry of entries) {
        process.stdout.write(`${entry.sha.slice(0, 10)}  ${entry.message}\n`);
      }
      return 0;
    }
    const restored = await shadow.undo();
    process.stdout.write(`restored to snapshot ${restored.sha.slice(0, 10)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof ShadowGitError) {
      process.stderr.write(`ERROR: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
