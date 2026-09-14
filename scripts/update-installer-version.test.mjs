import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeVersion,
  readInstallerVersion,
  updateInstallerVersion,
  verifyInstallerVersion,
} from "./update-installer-version.mjs";

const installerFixture = `#!/usr/bin/env sh
# OpenKai installer

REPO="Kaidera-AI/OpenKai"
# Now at v0.1.009 (released 2026-08-22; tag + assets live).
# this default is live for every \`curl | sh\` the moment it lands.
VERSION="\${OPENKAI_VERSION:-v0.1.009}"
PREFIX="\${OPENKAI_PREFIX:-$HOME/.local}"
`;

test("accepts only the canonical unprefixed 0.1.N release input", () => {
  assert.equal(normalizeVersion("0.1.13"), "v0.1.13");
});

test("rejects malformed versions", () => {
  for (const version of [
    "",
    " 0.1.13",
    "0.1.13 ",
    "1.1.13",
    "0.2.13",
    "0.1",
    "0.1.",
    "0.1.013",
    "0.1.13.1",
    "0.1.13-beta",
    "v0.1.13",
    "vv0.1.13",
  ]) {
    assert.throws(() => normalizeVersion(version), /invalid installer version/);
  }
});

test("reads the historical padded default but keeps canonical updates byte-for-byte idempotent", () => {
  assert.equal(readInstallerVersion(installerFixture), "v0.1.009");
  const canonical = updateInstallerVersion(installerFixture, "0.1.13", "2026-09-04");
  assert.equal(updateInstallerVersion(canonical, "0.1.13", "2099-01-01"), canonical);
  assert.equal(verifyInstallerVersion(canonical, "0.1.13"), "v0.1.13");
});

test("changed-version update touches only the release comment and default", () => {
  const expected = installerFixture
    .replace(
      "# Now at v0.1.009 (released 2026-08-22; tag + assets live).",
      "# Now at v0.1.13 (released 2026-09-04; tag + assets live).",
    )
    .replace(
      'VERSION="${OPENKAI_VERSION:-v0.1.009}"',
      'VERSION="${OPENKAI_VERSION:-v0.1.13}"',
    );

  const updated = updateInstallerVersion(installerFixture, "0.1.13", "2026-09-04");
  assert.equal(updated, expected);
  assert.equal(updateInstallerVersion(updated, "0.1.13", "2099-01-01"), expected);
  assert.equal(verifyInstallerVersion(updated, "0.1.13"), "v0.1.13");
});

test("refuses to move a newer installer default backward", () => {
  const newer = updateInstallerVersion(installerFixture, "0.1.14", "2026-09-05");
  assert.throws(
    () => updateInstallerVersion(newer, "0.1.13", "2026-09-06"),
    /refusing non-monotonic installer rewrite from v0\.1\.14 to v0\.1\.13/,
  );
});

test("verification fails closed on a stale or structurally ambiguous installer", () => {
  assert.throws(() => verifyInstallerVersion(installerFixture, "0.1.13"), /expected v0\.1\.13/);
  assert.throws(
    () => verifyInstallerVersion(`${installerFixture}\nVERSION="\${OPENKAI_VERSION:-v0.1.009}"\n`, "0.1.9"),
    /exactly one installer version default/,
  );
});
