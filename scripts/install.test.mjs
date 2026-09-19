import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
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

test("installer: a checksum-valid binary that cannot execute leaves the previous command in place", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "openkai-install-unexecutable-"));
  try {
    const bin = join(root, "commands");
    const prefix = join(root, "prefix");
    const destination = join(prefix, "bin", "openkai");
    mkdirSync(bin);
    mkdirSync(join(prefix, "bin"), { recursive: true });
    // The previous command is a real, runnable script -- proving it "survives"
    // means proving it still executes after the failed install, not just that
    // its bytes are unchanged (kai's ruling on vera's O-4, 2026-09-19).
    const originalScript = "#!/bin/sh\necho original-openkai-still-here\n";
    writeFileSync(destination, originalScript, { mode: 0o755 });
    // Bad interpreter path: the bytes match their own published checksum
    // exactly (the digest below is computed from this exact content), but
    // executing the file fails on every POSIX host because the shebang
    // target does not exist -- the same failure shape as a wrong-libc or
    // wrong-arch binary that happens to hash correctly.
    const brokenExecutable = "#!/no/such/interpreter-o4-test\necho should never run\n";
    const brokenDigest = createHash("sha256").update(brokenExecutable).digest("hex");
    const asset = `openkai-${process.platform}-${process.arch}`;
    writeFileSync(join(root, "fixture.json"), JSON.stringify({ asset, content: brokenExecutable, digest: brokenDigest }));
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
  content = fixture.content;
} else if (name === "SHA256SUMS.txt") {
  content = fixture.digest + "  " + fixture.asset + "\\n";
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
      },
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.ifError(result.error);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    const leftoverStaging = readdirSync(join(prefix, "bin")).filter(name => name.startsWith(".openkai."));
    assert.deepEqual(leftoverStaging, [], `expected no leftover staging file, found: ${leftoverStaging.join(", ")}\n${output}`);
    assert.match(output, /refusing to replace|does not run on this host/, output);
    // The actual receipt: invoke the previous command post-failure and prove
    // it still runs, not merely that its bytes are byte-identical.
    const rerun = spawnSync(destination, [], { encoding: "utf8", timeout: 5_000 });
    assert.ifError(rerun.error);
    assert.equal(rerun.status, 0, `previous command failed to run after the bad install attempt: ${rerun.stderr}`);
    assert.equal(rerun.stdout, "original-openkai-still-here\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer: detects musl libc and requests the musl asset", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "openkai-install-musl-"));
  try {
    const bin = join(root, "commands");
    const prefix = join(root, "prefix");
    mkdirSync(bin);
    mkdirSync(join(prefix, "bin"), { recursive: true });
    const executable = '#!/bin/sh\necho openkai/0.1.13\n';
    const digest = createHash("sha256").update(executable).digest("hex");
    const expectedAsset = "openkai-linux-musl-x64";
    const requestedLog = join(root, "requested-assets.log");
    writeFileSync(requestedLog, "");
    writeFileSync(join(root, "fixture.json"), JSON.stringify({ asset: expectedAsset, executable, digest }));
    // Fake uname forces os=linux/arch=x64 regardless of the machine actually
    // running this test (e.g. a macOS dev box), so the Linux-only musl branch
    // is genuinely exercised everywhere instead of being skipped off-Linux.
    writeFileSync(join(bin, "uname"), `#!/bin/sh
case "$1" in
  -s) echo "Linux" ;;
  -m) echo "x86_64" ;;
esac
`, { mode: 0o755 });
    // ldd reporting a musl banner is the real-world signal (Alpine and other
    // musl distros); this fake stands in for that host fact independently of
    // the faked uname above and of the runner's actual libc.
    writeFileSync(join(bin, "ldd"), `#!/bin/sh\necho "musl libc (x86_64)"\necho "Version 1.2.3"\n`, { mode: 0o755 });
    writeFileSync(join(bin, "curl"), `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const fixture = JSON.parse(fs.readFileSync(path.join(process.env.OPENKAI_INSTALL_FIXTURE, "fixture.json"), "utf8"));
const args = process.argv.slice(2);
const url = new URL(args[1]);
if (args[0] !== "-fsSL" || args[2] !== "-o" || url.origin !== "https://github.com") process.exit(90);
const name = url.pathname.split("/").at(-1);
fs.appendFileSync(process.env.OPENKAI_INSTALL_REQUESTED_LOG, name + "\\n");
let content;
if (name === fixture.asset) {
  content = fixture.executable;
} else if (name === "SHA256SUMS.txt") {
  content = fixture.digest + "  " + fixture.asset + "\\n";
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
        OPENKAI_INSTALL_REQUESTED_LOG: requestedLog,
      },
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.ifError(result.error);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    const requested = readFileSync(requestedLog, "utf8");
    assert.match(requested, new RegExp(`^${expectedAsset}$`, "m"), `expected a request for ${expectedAsset}, got:\n${requested}`);
    assert.equal(readFileSync(join(prefix, "bin", "openkai"), "utf8"), executable, output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
