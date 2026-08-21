/**
 * bd7d2928: the build-freshness pretest guard. Worktrees carry no node_modules,
 * so @kaidera/openkai-core resolves up to the main checkout, whose gitignored
 * dist can serve stale code to every worktree at once — surfacing as a fake
 * "has no exported member" against the test file. The guard must fail loudly
 * instead, and must stay silent on a fresh tree.
 *
 * Fixtures are synthetic core packages in a temp dir, so the ladder never
 * touches a real checkout's dist.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("../scripts/check-core-freshness.cjs", import.meta.url));
const REBUILD = "npm run -w @kaidera/openkai-core build";
const OLD = new Date("2026-01-01T00:00:00Z");
const NEW = new Date("2026-01-02T00:00:00Z");
/** Strictly after NEW: the guard compares src > dist, so equal mtimes are fresh. */
const NEWER = new Date("2026-01-03T00:00:00Z");

/** A fresh synthetic core: every dist artifact newer than every source file. */
function fixture(): { dir: string; core: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "core-freshness-"));
  const core = path.join(dir, "node_modules", "@kaidera", "openkai-core");
  mkdirSync(path.join(core, "src"), { recursive: true });
  mkdirSync(path.join(core, "dist"), { recursive: true });
  writeFileSync(path.join(core, "package.json"), '{"name":"@kaidera/openkai-core","version":"0.0.0","main":"dist/index.js"}');
  writeFileSync(path.join(core, "src", "index.ts"), "export const a = 1;\n");
  writeFileSync(path.join(core, "dist", "index.js"), "exports.a = 1;\n");
  writeFileSync(path.join(core, "dist", "index.d.ts"), "export declare const a: number;\n");
  writeFileSync(path.join(core, "tsconfig.tsbuildinfo"), "{}\n");
  utimesSync(path.join(core, "src", "index.ts"), OLD, OLD);
  for (const f of ["dist/index.js", "dist/index.d.ts", "tsconfig.tsbuildinfo"]) {
    utimesSync(path.join(core, f), NEW, NEW);
  }
  return { dir, core };
}

function runGuard(dir: string): { code: number; err: string } {
  const r = spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: "utf8" });
  return { code: r.status ?? -1, err: r.stderr };
}

/** name -> break the fixture; every break must be caught. */
const breakages: Array<[string, (core: string) => void]> = [
  ["source newer than dist", (core) => utimesSync(path.join(core, "src", "index.ts"), NEWER, NEWER)],
  ["dist absent", (core) => rmSync(path.join(core, "dist"), { recursive: true })],
  ["tsbuildinfo absent (built elsewhere)", (core) => rmSync(path.join(core, "tsconfig.tsbuildinfo"))],
  ["core unresolvable", (core) => rmSync(core, { recursive: true })],
];

test("a fresh core dist passes the guard", () => {
  const { dir } = fixture();
  try {
    assert.equal(runGuard(dir).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const [name, brk] of breakages) {
  test(`guard fails and names the rebuild: ${name}`, () => {
    const { dir, core } = fixture();
    try {
      brk(core);
      const { code, err } = runGuard(dir);
      assert.equal(code, 1, `expected failure for: ${name}`);
      assert.match(err, /BUILD-FRESHNESS FAILURE/);
      assert.ok(err.includes(REBUILD), `stderr must name "${REBUILD}"`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
