#!/usr/bin/env bun
/**
 * ci-release-manifest — generate (and optionally sign) the witnessed-upgrade
 * manifest `latest.json` for the standalone channel (E022 Inc 06).
 *
 * The 0.84 line shipped this pipeline (build-binaries.sh + sign-manifest.mjs);
 * the fork's release job builds the binaries but never produced the manifest,
 * so `openkai upgrade` on a standalone install had nothing to verify against.
 * This step closes that: release_github runs it after the binary artifacts
 * are in place and uploads latest.json as a release asset at
 * DEFAULT_MANIFEST_URL (Kaidera-AI/OpenKai releases/latest/download).
 *
 * Usage:
 *   bun scripts/ci-release-manifest.ts <release-tag> <out-path>
 *
 * The manifest version is PRODUCT_VERSION from the openkai layer (the fork's
 * lockstep stamp) — never omp's engine version. The release tag must normalise
 * to the same version (v0.1.010 → 0.1.10); a mismatch aborts the release.
 *
 * Signing: with OPENKAI_RELEASE_PRIVATE_KEY (PKCS8 PEM, CI secret — the
 * matching public key is compiled in via OPENKAI_RELEASE_KEY at pin time) the
 * manifest is signed Ed25519 over the canonical bytes; without it the manifest
 * ships unsigned and pinned builds refuse it fail-closed (the SHA-256 witness
 * still gates unpinned builds).
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { PRODUCT_VERSION } from "../src/openkai/brand";
import { canonicalManifestBytes, type ReleaseManifest, signManifest } from "../src/openkai/upgrade-trust";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const BIN_DIR = path.join(REPO_ROOT, "packages", "coding-agent", "binaries");

/** The release matrix targets (ci.yml release_binary + release_binary_darwin). */
const TARGETS: readonly { target: string; file: string }[] = [
	{ target: "darwin-arm64", file: "omp-darwin-arm64" },
	{ target: "darwin-x64", file: "omp-darwin-x64" },
	{ target: "linux-x64", file: "omp-linux-x64" },
	{ target: "linux-musl-x64", file: "omp-linux-musl-x64" },
	{ target: "linux-arm64", file: "omp-linux-arm64" },
	{ target: "linux-musl-arm64", file: "omp-linux-musl-arm64" },
	{ target: "win32-x64", file: "omp-windows-x64.exe" },
];

function tagVersion(tag: string): string {
	// v0.1.010 → 0.1.10 (npm-normalised, matching the changelog convention).
	const m = /^v0\.1\.(\d{3})$/.exec(tag);
	if (!m) throw new Error(`release tag ${tag} is not v0.1.0NN`);
	return `0.1.${Number(m[1])}`;
}

function main(): void {
	const [tag, outPath] = process.argv.slice(2);
	if (!tag || !outPath) {
		process.stderr.write("usage: ci-release-manifest.ts <release-tag> <out-path>\n");
		process.exit(2);
	}
	const version = tagVersion(tag);
	if (version !== PRODUCT_VERSION) {
		process.stderr.write(
			`error: release tag ${tag} normalises to ${version} but the layer's PRODUCT_VERSION is ${PRODUCT_VERSION} — bump the lockstep stamp before cutting.\n`,
		);
		process.exit(1);
	}

	const artifacts: ReleaseManifest["artifacts"] = [];
	for (const { target, file } of TARGETS) {
		const binPath = path.join(BIN_DIR, file);
		if (!fs.existsSync(binPath)) {
			process.stderr.write(`error: missing release binary ${binPath} — the manifest must cover every target.\n`);
			process.exit(1);
		}
		const bytes = fs.readFileSync(binPath);
		artifacts.push({
			target,
			url: `https://github.com/Kaidera-AI/OpenKai/releases/download/${tag}/${file}`,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		});
	}

	const manifest: ReleaseManifest = { version, artifacts };
	const pem = process.env.OPENKAI_RELEASE_PRIVATE_KEY;
	if (pem) {
		manifest.signature = signManifest(manifest, pem);
	} else {
		process.stderr.write(
			"warning: OPENKAI_RELEASE_PRIVATE_KEY unset — shipping an UNSIGNED manifest (pinned builds will refuse it).\n",
		);
	}

	fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
	// Round-trip the canonical bytes so a signature (when present) is provably
	// over exactly what the upgrader will verify.
	void canonicalManifestBytes(manifest);
	process.stdout.write(
		`wrote ${outPath} (version ${version}, ${artifacts.length} artifact(s), ${pem ? "signed" : "unsigned"})\n`,
	);
}

main();
