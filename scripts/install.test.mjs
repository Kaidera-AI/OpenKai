import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const installer = process.env.OPENKAI_TEST_INSTALLER ?? fileURLToPath(new URL("./install.sh", import.meta.url));
const executable = '#!/bin/sh\necho openkai/0.1.13\necho executed >> "$OPENKAI_INSTALL_EXECUTED"\n';
const digest = createHash("sha256").update(executable).digest("hex");
const modes = [
  ["manifest", true],
  ["sidecar", true],
  ["legacy", true],
  ["tampered-manifest", false],
  ["tampered-sidecar", false],
  ["missing", false],
  ["invalid", false],
  ["wrong-asset", false],
  ["duplicate", false],
];

for (const [mode, succeeds] of modes) {
  test(`installer ${mode}: verifies before replacing or executing`, { skip: process.platform === "win32" }, () => {
    const root = mkdtempSync(join(tmpdir(), "openkai-install-integrity-"));
    try {
      const bin = join(root, "commands");
      const prefix = join(root, "prefix");
      const destination = join(prefix, "bin", "openkai");
      const executed = join(root, "executed");
      mkdirSync(bin);
      mkdirSync(join(prefix, "bin"), { recursive: true });
      writeFileSync(destination, "original installation\n");
      const currentAsset = `openkai-${process.platform}-${process.arch}`;
      const asset = mode === "legacy" ? currentAsset.replace("openkai-", "omp-") : currentAsset;
      writeFileSync(join(root, "fixture.json"), JSON.stringify({ mode, asset, executable, digest }));
      writeFileSync(join(bin, "curl"), `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.OPENKAI_INSTALL_FIXTURE, "fixture.json"), "utf8"));
const args = process.argv.slice(2);
const url = new URL(args[1]);
if (args[0] !== "-fsSL" || args[2] !== "-o" || url.origin !== "https://github.com") process.exit(90);
const name = url.pathname.split("/").at(-1);
let content;
if (name === fixture.asset) {
  content = fixture.executable + (fixture.mode.startsWith("tampered") ? "# corrupt bytes\\n" : "");
} else if (name === fixture.asset + ".sha256" && fixture.mode.endsWith("sidecar")) {
  content = fixture.digest + "  " + fixture.asset + "\\n";
} else if (name === "SHA256SUMS.txt" && fixture.mode !== "missing") {
  const hash = fixture.mode === "invalid" ? "not-a-digest" : fixture.digest;
  const asset = fixture.mode === "wrong-asset" ? "openkai-another-platform" : fixture.asset;
  content = hash + "  " + asset + "\\n";
  if (fixture.mode === "duplicate") content += content;
} else process.exit(22);
fs.writeFileSync(args[3], content);
`, { mode: 0o755 });
      const result = spawnSync("/bin/sh", [installer], {
        env: {
          ...process.env,
          HOME: root,
          PATH: `${bin}:${process.env.PATH}`,
          OPENKAI_PREFIX: prefix,
          OPENKAI_VERSION: "v0.1.13",
          OPENKAI_INSTALL_FIXTURE: root,
          OPENKAI_INSTALL_EXECUTED: executed,
        },
        encoding: "utf8",
        timeout: 20_000,
      });
      assert.ifError(result.error);
      const output = `${result.stdout}\n${result.stderr}`;
      if (succeeds) {
        assert.equal(result.status, 0, output);
        assert.equal(readFileSync(destination, "utf8"), executable);
        assert.equal(readFileSync(executed, "utf8"), "executed\n");
      } else {
        assert.notEqual(result.status, 0, output);
        assert.equal(readFileSync(destination, "utf8"), "original installation\n");
        assert.equal(existsSync(executed), false, output);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
