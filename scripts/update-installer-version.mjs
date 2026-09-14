import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TARGET_VERSION_PATTERN = /^0\.1\.(?:0|[1-9]\d*)$/;
const RELEASE_COMMENT_PATTERN = /^# Now at (v0\.1\.\d+) \(released (\d{4}-\d{2}-\d{2}); tag \+ assets live\)\.$/gm;
const DEFAULT_PATTERN = /^VERSION="\$\{OPENKAI_VERSION:-(v0\.1\.\d+)\}"$/gm;

export function normalizeVersion(input) {
  if (typeof input !== "string" || !TARGET_VERSION_PATTERN.test(input)) {
    throw new Error(`invalid installer version: ${JSON.stringify(input)} (expected canonical unprefixed 0.1.N)`);
  }
  return `v${input}`;
}

function oneMatch(contents, pattern, label) {
  const matches = [...contents.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one installer ${label}; found ${matches.length}`);
  }
  return matches[0];
}

function inspectInstaller(contents) {
  const comment = oneMatch(contents, RELEASE_COMMENT_PATTERN, "release comment");
  const defaultVersion = oneMatch(contents, DEFAULT_PATTERN, "version default");
  if (comment[1] !== defaultVersion[1]) {
    throw new Error(`installer release comment (${comment[1]}) and default (${defaultVersion[1]}) disagree`);
  }
  return { version: comment[1], releasedOn: comment[2] };
}

export function readInstallerVersion(contents) {
  return inspectInstaller(contents).version;
}

export function verifyInstallerVersion(contents, input) {
  const expected = normalizeVersion(input);
  const actual = inspectInstaller(contents).version;
  if (actual !== expected) {
    throw new Error(`installer default is ${actual}; expected ${expected}`);
  }
  return expected;
}

export function updateInstallerVersion(contents, input, releasedOn = new Date().toISOString().slice(0, 10)) {
  const version = normalizeVersion(input);
  const current = inspectInstaller(contents);
  if (current.version === version) {
    return contents;
  }
  const currentPatch = BigInt(current.version.slice("v0.1.".length));
  const targetPatch = BigInt(version.slice("v0.1.".length));
  if (currentPatch >= targetPatch) {
    throw new Error(`refusing non-monotonic installer rewrite from ${current.version} to ${version}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releasedOn)) {
    throw new Error(`invalid release date: ${JSON.stringify(releasedOn)} (expected YYYY-MM-DD)`);
  }

  const updated = contents
    .replace(RELEASE_COMMENT_PATTERN, `# Now at ${version} (released ${releasedOn}; tag + assets live).`)
    .replace(DEFAULT_PATTERN, `VERSION="\${OPENKAI_VERSION:-${version}}"`);
  verifyInstallerVersion(updated, input);
  return updated;
}

async function main(args) {
  const [command, version, file = "scripts/install.sh", ...extra] = args;
  if (extra.length > 0 || !["update", "verify"].includes(command) || version === undefined) {
    throw new Error("usage: node scripts/update-installer-version.mjs <update|verify> <0.1.N> [installer-path]");
  }

  const installerPath = resolve(file);
  const contents = await readFile(installerPath, "utf8");
  if (command === "verify") {
    const normalized = verifyInstallerVersion(contents, version);
    console.log(`installer default verified at ${normalized}`);
    return;
  }

  const updated = updateInstallerVersion(contents, version);
  if (updated === contents) {
    console.log(`installer default already at ${normalizeVersion(version)}`);
    return;
  }
  await writeFile(installerPath, updated);
  console.log(`installer default updated to ${normalizeVersion(version)}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
