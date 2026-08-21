/**
 * openkai upgrade tests (Inc 08, ADR OK-8 dual-channel). All filesystem
 * operations run against in-memory fakes or mkdtemp temp dirs; no real
 * network and no operator repo mutation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  BUILD_CHANNEL,
  type Channel,
  type ReleaseManifest,
  type UpgradeDeps,
  Upgrader,
  WitnessMismatchError,
  canonicalManifestBytes,
  compareVersions,
  detectTarget,
  manifestUrlForVersion,
  resolveAutoUpdateEnabled,
  resolveChannel,
  sha256Hex,
  signManifest,
  verifyManifestSignature,
} from "../dist/upgrade.js";

// ─── Pure helpers ────────────────────────────────────────────────────────────

test("channel selection: build-time stamp is authoritative; env overrides", () => {
  assert.equal(resolveChannel({ buildChannel: "npm" }), "npm");
  assert.equal(resolveChannel({ buildChannel: "standalone" }), "standalone");
  assert.equal(
    resolveChannel({ buildChannel: "npm", envChannel: "standalone" }),
    "standalone",
  );
  assert.equal(
    resolveChannel({ buildChannel: "standalone", envChannel: "npm" }),
    "npm",
  );
  // invalid env value is ignored → falls back to build stamp
  assert.equal(
    resolveChannel({ buildChannel: "npm", envChannel: "garbage" }),
    "npm",
  );
});

test("channel selection: the shipped npm build stamps BUILD_CHANNEL=npm (pinned by construction)", () => {
  // The npm tarball is compiled by `tsc`, never by build-binaries.sh, so the
  // OPENKAI_BUILD_CHANNEL define is absent and the constant defaults to npm.
  assert.equal(BUILD_CHANNEL, "npm");
});

test("kill-switch: falsey values disable auto-upgrade entirely; unset/other enable it", () => {
  for (const off of ["false", "0", "no", "off", "FALSE", " Off "]) {
    assert.equal(resolveAutoUpdateEnabled(off), false, `${off} should disable`);
  }
  assert.equal(resolveAutoUpdateEnabled(undefined), true);
  assert.equal(resolveAutoUpdateEnabled("true"), true);
  assert.equal(resolveAutoUpdateEnabled("1"), true);
});

test("version comparison: semver-ish ordering", () => {
  assert.equal(compareVersions("0.0.0", "0.0.1"), -1);
  assert.equal(compareVersions("0.1.0", "0.0.9"), 1);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
});

test("target detection maps x64/arm64 + darwin/linux", () => {
  assert.equal(detectTarget("darwin", "arm64"), "darwin-arm64");
  assert.equal(detectTarget("linux", "x64"), "linux-x64");
  assert.equal(detectTarget("darwin", "x64"), "darwin-x64");
});

test("manifestUrlForVersion rewrites latest.json and appends otherwise", () => {
  assert.equal(
    manifestUrlForVersion("https://openkai.dev/releases/latest.json", "0.1.0"),
    "https://openkai.dev/releases/0.1.0.json",
  );
  assert.equal(
    manifestUrlForVersion("https://x/releases/", "0.1.0"),
    "https://x/releases/0.1.0.json",
  );
});

// ─── Witness ──────────────────────────────────────────────────────────────────

function manifest(version: string, bytes: Uint8Array, target = "darwin-arm64"): ReleaseManifest {
  return {
    version,
    artifacts: [{ target, url: `https://x/openkai-${target}`, sha256: sha256Hex(bytes) }],
  };
}

test("witness: artifact sha256 match passes; mismatch throws WitnessMismatchError", async () => {
  const good = new TextEncoder().encode("binary-a");
  const m = manifest("0.0.1", good);
  const u = new Upgrader({
    manifestUrl: "https://x/latest.json",
    currentBinary: "/tmp/x",
    currentVersion: "0.0.0",
    target: "darwin-arm64",
    autoUpdateEnabled: true,
    deps: fakeDeps({ manifest: m, artifactBytes: good }),
  });
  const res = await u.upgrade();
  assert.equal(res.alreadyUpToDate, false);
  assert.equal(res.from, "0.0.0");
  assert.equal(res.to, "0.0.1");
});

test("witness: sha256 mismatch is refused before any swap", async () => {
  const real = new TextEncoder().encode("real-binary");
  const tampered = new TextEncoder().encode("tampered-binary");
  const m = manifest("0.0.1", real);
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  await writeFile(bin, "current-bytes");
  try {
    const u = new Upgrader({
      manifestUrl: "https://x/latest.json",
      currentBinary: bin,
      currentVersion: "0.0.0",
      target: "darwin-arm64",
      autoUpdateEnabled: true,
      deps: fakeDeps({ manifest: m, artifactBytes: tampered }),
    });
    await assert.rejects(u.upgrade(), (err: unknown) => {
      assert.ok(err instanceof WitnessMismatchError);
      assert.equal((err as WitnessMismatchError).kind, "artifact");
      return true;
    });
    // current binary untouched on refusal
    assert.equal(await readFile(bin, "utf-8"), "current-bytes");
    assert.equal(await readFile(`${bin}.new`, "utf-8").catch(() => "absent"), "absent");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("witness: Ed25519 manifest signature is verified when a key is pinned", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const bytes = new TextEncoder().encode("binary");
  const m = manifest("0.0.1", bytes);
  const sig = signManifest(m, privateKey.export({ format: "pem", type: "pkcs8" }).toString());
  assert.equal(verifyManifestSignature(m, pubB64, sig), true);
  // tampered version → signature invalid
  const tampered = { ...m, version: "9.9.9" };
  assert.equal(verifyManifestSignature(tampered, pubB64, sig), false);
  // canonical bytes are stable + exclude the signature field
  const canon = new TextDecoder().decode(canonicalManifestBytes(m));
  assert.ok(canon.includes('"version":"0.0.1"'));
  assert.ok(!canon.includes("signature"));
});

test("witness: unsigned manifest is refused when a release key is pinned", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const good = new TextEncoder().encode("binary");
  const m = manifest("0.0.1", good); // no signature field
  const u = new Upgrader({
    manifestUrl: "https://x/latest.json",
    currentBinary: "/tmp/x",
    currentVersion: "0.0.0",
    target: "darwin-arm64",
    autoUpdateEnabled: true,
    releasePublicKey: pubB64,
    deps: fakeDeps({ manifest: m, artifactBytes: good }),
  });
  await assert.rejects(u.check(), (err: unknown) => {
    assert.ok(err instanceof WitnessMismatchError);
    assert.equal((err as WitnessMismatchError).kind, "manifest");
    return true;
  });
  void privateKey;
});

// ─── Upgrader: upgrade + rollback + kill-switch ───────────────────────────────

test("upgrade: swaps binary, preserves previous, reports version bump", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  await writeFile(bin, "old-bytes");
  try {
    const newBytes = new TextEncoder().encode("new-bytes");
    const m = manifest("0.0.1", newBytes);
    const u = new Upgrader({
      manifestUrl: "https://x/latest.json",
      currentBinary: bin,
      currentVersion: "0.0.0",
      target: "darwin-arm64",
      autoUpdateEnabled: true,
      deps: fakeDeps({ manifest: m, artifactBytes: newBytes }),
    });
    const res = await u.upgrade();
    assert.equal(res.alreadyUpToDate, false);
    assert.equal(res.to, "0.0.1");
    assert.equal(new TextDecoder().decode(await readFile(bin)), "new-bytes");
    assert.equal(await readFile(`${bin}.previous`, "utf-8"), "old-bytes");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade: already-up-to-date is a no-op (no swap, no previous written)", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  await writeFile(bin, "current-bytes");
  try {
    const sameBytes = new TextEncoder().encode("current-bytes");
    const m = manifest("0.0.0", sameBytes); // same version
    const u = new Upgrader({
      manifestUrl: "https://x/latest.json",
      currentBinary: bin,
      currentVersion: "0.0.0",
      target: "darwin-arm64",
      autoUpdateEnabled: true,
      deps: fakeDeps({ manifest: m, artifactBytes: sameBytes }),
    });
    const res = await u.upgrade();
    assert.equal(res.alreadyUpToDate, true);
    assert.equal(await readFile(bin, "utf-8"), "current-bytes");
    assert.equal(await readFile(`${bin}.previous`, "utf-8").catch(() => "absent"), "absent");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("kill-switch: upgrade refuses entirely when disabled; no swap happens", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  await writeFile(bin, "current-bytes");
  try {
    const newBytes = new TextEncoder().encode("new-bytes");
    const m = manifest("0.0.1", newBytes);
    const u = new Upgrader({
      manifestUrl: "https://x/latest.json",
      currentBinary: bin,
      currentVersion: "0.0.0",
      target: "darwin-arm64",
      autoUpdateEnabled: false, // kill-switch off
      deps: fakeDeps({ manifest: m, artifactBytes: newBytes }),
    });
    await assert.rejects(u.upgrade(), (err: unknown) => {
      assert.equal((err as Error).name, "AutoUpdateDisabledError");
      return true;
    });
    assert.equal(await readFile(bin, "utf-8"), "current-bytes");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("rollback: restores previous binary and is NOT gated by the kill-switch", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  const prev = `${bin}.previous`;
  await writeFile(bin, "new-bytes");
  await writeFile(prev, "old-bytes");
  try {
    const u = new Upgrader({
      manifestUrl: "https://x/latest.json",
      currentBinary: bin,
      currentVersion: "0.0.1",
      target: "darwin-arm64",
      autoUpdateEnabled: false, // kill-switch off — rollback still works
      deps: fakeDeps({ manifest: manifest("0.0.1", new TextEncoder().encode("x")), artifactBytes: new TextEncoder().encode("x") }),
    });
    const res = await u.rollback();
    assert.equal(res.from, "0.0.1");
    assert.equal(await readFile(bin, "utf-8"), "old-bytes");
    // the rolled-back-from binary is now the new previous (reversible)
    assert.equal(await readFile(prev, "utf-8"), "new-bytes");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("rollback: throws NoPreviousBinaryError when none preserved", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  await writeFile(bin, "current-bytes");
  try {
    const u = new Upgrader({
      manifestUrl: "https://x/latest.json",
      currentBinary: bin,
      currentVersion: "0.0.0",
      target: "darwin-arm64",
      autoUpdateEnabled: true,
      deps: fakeDeps({ manifest: manifest("0.0.0", new TextEncoder().encode("x")), artifactBytes: new TextEncoder().encode("x") }),
    });
    await assert.rejects(u.rollback(), (err: unknown) => {
      assert.equal((err as Error).name, "NoPreviousBinaryError");
      return true;
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("upgrade then rollback round-trip restores the original binary", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  await writeFile(bin, "old-bytes");
  try {
    const newBytes = new TextEncoder().encode("new-bytes");
    const m = manifest("0.0.1", newBytes);
    const u = new Upgrader({
      manifestUrl: "https://x/latest.json",
      currentBinary: bin,
      currentVersion: "0.0.0",
      target: "darwin-arm64",
      autoUpdateEnabled: true,
      deps: fakeDeps({ manifest: m, artifactBytes: newBytes }),
    });
    await u.upgrade();
    assert.equal(await readFile(bin, "utf-8"), "new-bytes");
    await u.rollback();
    assert.equal(await readFile(bin, "utf-8"), "old-bytes");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

// ─── CLI runner (channel selection end-to-end) ───────────────────────────────

test("CLI: npm --check is read-only — never spawns npm (0.1.8 regression)", async () => {
  const { runUpgrade } = await import("../dist/upgrade.js");
  let spawned = false;
  const deps = recordingDeps([]);
  const res = await runUpgrade({
    env: { OPENKAI_CHANNEL: "npm" },
    check: true,
    currentBinary: "/tmp/x",
    currentVersion: "0.0.0",
    deps: {
      ...deps,
      runExternal: async () => {
        spawned = true;
        return { code: 0, output: "" };
      },
    },
  });
  assert.equal(res.exitCode, 0);
  assert.equal(spawned, false, "--check must not execute the package manager");
  assert.match(res.message, /no npm command was run/);
});

test("CLI: npm channel runs `npm install -g` through injected deps — no real spawn", async () => {
  const { runUpgrade } = await import("../dist/upgrade.js");
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const res = await runUpgrade({
    env: { OPENKAI_CHANNEL: "npm" },
    currentBinary: "/tmp/x",
    currentVersion: "0.0.0",
    deps: recordingDeps(calls),
  });
  assert.equal(res.channel, "npm");
  assert.equal(res.exitCode, 0);
  assert.match(res.message, /channel: npm/);
  assert.match(res.message, /ran successfully/);
  assert.match(res.message, /npm install -g/);
  // the fake — never a real package manager — received the exact command
  assert.deepEqual(calls, [
    { cmd: "npm", args: ["install", "-g", "@kaidera/openkai@latest"] },
  ]);
});

// ─── E019: bun channel (isBunManaged detection + managed branch) ─────────────
// Ported from unmerged a23368c (cole/autonomy-aaf1d122…): the bun channel
// shipped in 153717c with zero coverage.

test("isBunManaged: interpreter under ~/.bun is bun-managed", async () => {
  const { isBunManaged } = await import("../dist/upgrade.js");
  assert.equal(isBunManaged("/Users/u/.bun/bin/bun"), true);
});

test("isBunManaged: bin shim under ~/.bun via argv[1] is bun-managed even under node", async () => {
  const { isBunManaged } = await import("../dist/upgrade.js");
  const oldArgv = [...process.argv];
  try {
    process.argv[1] = "/Users/u/.bun/bin/openkai";
    assert.equal(isBunManaged("/usr/local/bin/node"), true);
  } finally {
    process.argv = oldArgv;
  }
});

test("isBunManaged: plain node + plain script is not bun-managed", async () => {
  const { isBunManaged } = await import("../dist/upgrade.js");
  const oldArgv = [...process.argv];
  try {
    process.argv[1] = "/usr/local/lib/node_modules/@kaidera/openkai/dist/index.js";
    assert.equal(isBunManaged("/usr/local/bin/node"), false);
  } finally {
    process.argv = oldArgv;
  }
});

test("isBunManaged: custom BUN_INSTALL shim resolves through the bun install tree", async () => {
  const { isBunManaged } = await import("../dist/upgrade.js");
  // bun add -g with BUN_INSTALL=/custom/root: bin/openkai symlinks into
  // <root>/install/global/node_modules/... — realpath reveals it even though
  // neither the interpreter nor argv[1] names ~/.bun.
  const root = await mkdtemp(path.join(tmpdir(), "openkai-bun-"));
  const target = path.join(root, "install", "global", "node_modules", "@kaidera", "openkai", "dist");
  await fsp.mkdir(target, { recursive: true });
  await fsp.writeFile(path.join(target, "index.js"), "// shim target\n");
  await fsp.mkdir(path.join(root, "bin"), { recursive: true });
  await fsp.symlink(
    path.join("..", "install", "global", "node_modules", "@kaidera", "openkai", "dist", "index.js"),
    path.join(root, "bin", "openkai"),
  );
  const oldArgv = [...process.argv];
  try {
    process.argv[1] = path.join(root, "bin", "openkai");
    assert.equal(isBunManaged("/usr/local/bin/node"), true, "custom BUN_INSTALL shim is bun-managed");
  } finally {
    process.argv = oldArgv;
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test("CLI: bun-managed install defers to `bun add -g` through injected deps — no real spawn", async () => {
  const { runUpgrade } = await import("../dist/upgrade.js");
  const oldExec = process.execPath;
  const calls: Array<{ cmd: string; args: string[] }> = [];
  try {
    // bun-pathed and not brew-pathed; currentBinary stays undefined so the
    // managed-install branch (src/upgrade.ts bun gate) is the one exercised
    process.execPath = "/Users/u/.bun/bin/bun";
    const res = await runUpgrade({
      env: {},
      currentVersion: "0.0.0",
      deps: recordingDeps(calls),
    });
    assert.equal(res.exitCode, 0);
    assert.match(res.message, /channel: bun \(managed\)/);
    assert.match(res.message, /bun add -g @kaidera\/openkai ran successfully/);
    assert.deepEqual(calls, [{ cmd: "bun", args: ["add", "-g", "@kaidera/openkai"] }]);
  } finally {
    process.execPath = oldExec;
  }
});

test("CLI: bun add failure surfaces exit 1 with the exit code in the message", async () => {
  const { runUpgrade } = await import("../dist/upgrade.js");
  const oldExec = process.execPath;
  const calls: Array<{ cmd: string; args: string[] }> = [];
  try {
    process.execPath = "/Users/u/.bun/bin/bun";
    const res = await runUpgrade({
      env: {},
      currentVersion: "0.0.0",
      deps: recordingDeps(calls, 7),
    });
    assert.equal(res.exitCode, 1);
    assert.match(res.message, /bun add failed \(exit 7\)/);
    assert.equal(calls.length, 1, "the injected fake — not a real bun — was invoked");
  } finally {
    process.execPath = oldExec;
  }
});

test("CLI: standalone upgrade applies with kill-switch unset; --check reports available", async () => {
  const { runUpgrade } = await import("../dist/upgrade.js");
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  await writeFile(bin, "old-bytes");
  try {
    const newBytes = new TextEncoder().encode("new-bytes");
    const m = manifest("0.0.1", newBytes);
    const deps = fakeDeps({ manifest: m, artifactBytes: newBytes });
    const check = await runUpgrade({
      check: true,
      env: { OPENKAI_CHANNEL: "standalone" },
      currentBinary: bin,
      currentVersion: "0.0.0",
      target: "darwin-arm64", // pin: detectTarget() follows the CI host's platform
      deps,
    });
    assert.equal(check.exitCode, 0);
    assert.match(check.message, /channel: standalone/);
    assert.match(check.message, /auto-update: enabled/);
    assert.match(check.message, /update available: yes/);

    const up = await runUpgrade({
      env: { OPENKAI_CHANNEL: "standalone" },
      currentBinary: bin,
      currentVersion: "0.0.0",
      target: "darwin-arm64",
      deps,
    });
    assert.equal(up.exitCode, 0);
    assert.match(up.message, /upgrade complete: 0.0.1/);
    assert.equal(await readFile(bin, "utf-8"), "new-bytes");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("CLI: kill-switch off → upgrade exits 1 and refuses; --rollback still works", async () => {
  const { runUpgrade } = await import("../dist/upgrade.js");
  const cwd = await mkdtemp(path.join(tmpdir(), "openkai-up-"));
  const bin = path.join(cwd, "openkai");
  await writeFile(bin, "new-bytes");
  await writeFile(`${bin}.previous`, "old-bytes");
  try {
    const newBytes = new TextEncoder().encode("newer-bytes");
    const m = manifest("0.0.2", newBytes);
    const deps = fakeDeps({ manifest: m, artifactBytes: newBytes });
    const refused = await runUpgrade({
      env: { OPENKAI_CHANNEL: "standalone", OPENKAI_AUTO_UPDATE_ENABLED: "false" },
      currentBinary: bin,
      currentVersion: "0.0.1",
      deps,
    });
    assert.equal(refused.exitCode, 1);
    assert.equal(refused.autoUpdateEnabled, false);
    assert.match(refused.message, /disabled/);
    assert.equal(await readFile(bin, "utf-8"), "new-bytes"); // untouched

    const rolled = await runUpgrade({
      rollback: true,
      env: { OPENKAI_CHANNEL: "standalone", OPENKAI_AUTO_UPDATE_ENABLED: "false" },
      currentBinary: bin,
      currentVersion: "0.0.1",
      deps,
    });
    assert.equal(rolled.exitCode, 0);
    assert.match(rolled.message, /rollback complete/);
    assert.equal(await readFile(bin, "utf-8"), "old-bytes");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("CLI: OPENKAI_CHANNEL=standalone on an npm build refuses — never overwrites process.execPath", async () => {
  const { runUpgrade } = await import("../dist/upgrade.js");
  // No `currentBinary`: this is the real-operator path where it would default
  // to process.execPath (node, under an npm install). The swap must be refused
  // before any download — overwriting the host interpreter is not an upgrade.
  const newBytes = new TextEncoder().encode("newer-bytes");
  const m = manifest("9.9.9", newBytes);
  let downloaded = false;
  const deps = {
    ...fakeDeps({ manifest: m, artifactBytes: newBytes }),
    download: async () => {
      downloaded = true;
      return newBytes;
    },
  };
  const execPathBefore = await readFile(process.execPath);

  const res = await runUpgrade({
    env: { OPENKAI_CHANNEL: "standalone" },
    currentVersion: "0.0.1",
    deps,
  });

  assert.equal(res.exitCode, 1);
  assert.match(res.message, /not a\nstandalone binary/);
  assert.equal(downloaded, false, "must refuse before downloading an artifact");
  assert.deepEqual(
    await readFile(process.execPath),
    execPathBefore,
    "the running interpreter must be byte-identical after a refused upgrade",
  );
});

// ─── test helpers ─────────────────────────────────────────────────────────────

interface FakeState {
  manifest: ReleaseManifest;
  artifactBytes: Uint8Array;
  /** optional: per-URL override of downloaded bytes (for tamper tests) */
  downloadedBytes?: Uint8Array;
}

/**
 * Real-filesystem deps with only the network faked (mirrors the undo tests'
 * pattern of real ops on mkdtemp temp dirs). No real network, no operator
 * repo mutation — every path the Upgrader touches lives in a temp dir.
 */
function fakeDeps(state: FakeState): UpgradeDeps {
  return {
    fetchManifest: async () => state.manifest,
    download: async () => state.downloadedBytes ?? state.artifactBytes,
    runExternal: async () => ({ code: 0, output: "ok" }),
    readFile: (p) => fsp.readFile(p),
    writeFile: (p, d) => fsp.writeFile(p, d),
    rename: (from, to) => fsp.rename(from, to),
    copyFile: (from, to) => fsp.copyFile(from, to),
    chmod: async () => {},
    stat: async (p: string) => {
      const st = await fsp.stat(p);
      return { isFile: st.isFile() };
    },
  };
}

/**
 * fakeDeps plus a runExternal that records instead of spawning — for the
 * managed-channel (brew/bun/npm) branches, which must never reach a real
 * package manager from the test suite.
 */
function recordingDeps(
  calls: Array<{ cmd: string; args: string[] }>,
  code = 0,
): UpgradeDeps {
  return {
    ...fakeDeps({
      manifest: manifest("0.0.0", new TextEncoder().encode("x")),
      artifactBytes: new TextEncoder().encode("x"),
    }),
    runExternal: async (cmd, args) => {
      calls.push({ cmd, args });
      return { code, output: code === 0 ? "ok" : "boom" };
    },
  };
}

// satisfy the unused-import linter for the re-exported type
void (BUILD_CHANNEL as Channel);

// ─── E017 inc 09: the release-key pin + signing tool ───────────────────────

test("release-key pin: build-binaries.sh carries a well-formed SPKI pin define", async () => {
  // Runner-independent anchor (tui-test relocates compiled tests) — cwd is packages/cli under both runners.
  const script = await readFile(path.resolve(process.cwd(), "scripts", "build-binaries.sh"), "utf-8");
  const pinMatch = /OPENKAI_RELEASE_PUBLIC_KEY_PIN="([^"]+)"/.exec(script);
  assert.ok(pinMatch, "the pin constant exists");
  const der = Buffer.from(pinMatch![1]!, "base64");
  assert.equal(der.length, 44, "Ed25519 SPKI DER is 44 bytes");
  assert.ok(
    script.includes("--define=OPENKAI_RELEASE_KEY"),
    "the compile line injects the pin via --define",
  );
});

test("sign-manifest.mjs: signs a manifest the pinned verify path accepts", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-sign-"));
  try {
    const manifestPath = path.join(dir, "latest.json");
    const artifact = { target: "darwin-arm64", url: "https://x/openkai", sha256: "ab".repeat(32) };
    await writeFile(manifestPath, JSON.stringify({ version: "9.9.9", artifacts: [artifact] }, null, 2));
    // Runner-independent anchor (tui-test relocates compiled tests) — cwd is packages/cli under both runners.
    const script = path.resolve(process.cwd(), "scripts", "sign-manifest.mjs");
    const result = spawnSync(process.execPath, [script, manifestPath], {
      env: { ...process.env, OPENKAI_RELEASE_PRIVATE_KEY: pem },
      encoding: "utf-8",
    });
    assert.equal(result.status, 0, result.stderr);
    const signed = JSON.parse(await readFile(manifestPath, "utf-8")) as ReleaseManifest & { signature: string };
    assert.ok(signed.signature.length > 0);
    assert.equal(verifyManifestSignature(signed, pubB64, signed.signature), true);
    // tampered artifact sha → refused
    const tampered = { ...signed, artifacts: [{ ...artifact, sha256: "cd".repeat(32) }] };
    assert.equal(verifyManifestSignature(tampered, pubB64, signed.signature), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
