/**
 * openkai/upgrade-trust (E022 Inc 04) — the release trust-root, ported from the
 * certified 0.84 line (packages/cli/src/upgrade.ts, security-audited 2026-08-16).
 *
 * The fork's native `update` machinery verifies a GitHub-reported SHA-256 digest
 * (update-cli.ts) — that trusts GitHub's own attestation, not a signed release.
 * This module adds the two guarantees the 0.84 line shipped and the fork lacks:
 *
 *   1. An Ed25519-signed release manifest. When a release key is pinned (build
 *      define OPENKAI_RELEASE_KEY or env OPENKAI_RELEASE_PUBLIC_KEY), a manifest
 *      WITHOUT a valid signature is refused fail-closed. Unpinned → the SHA-256
 *      artifact witness still gates every swap, but signature verification is
 *      skipped (and the runner warns).
 *   2. A reversible binary rollback (the `.previous` sidecar), which upstream's
 *      binary-method update does not provide.
 *
 * Everything here is pure/injectable so the gate test exercises the real logic
 * with fake deps — no network, no binary swaps in the suite.
 */

import { createHash, createPublicKey, sign, verify } from "node:crypto";

// ─── Channel stamp + detection ────────────────────────────────────────────────

/** The build-time channel. `bun build --compile --define OPENKAI_BUILD_CHANNEL`
 * stamps "standalone"; the npm build never defines it. `typeof` on an undeclared
 * global is safe (no ReferenceError); the value branch only runs when the define
 * replaced the identifier with a literal. */
declare const OPENKAI_BUILD_CHANNEL: string | undefined;

export type Channel = "standalone" | "npm";

export const BUILD_CHANNEL: Channel =
	typeof OPENKAI_BUILD_CHANNEL !== "undefined" && OPENKAI_BUILD_CHANNEL === "standalone" ? "standalone" : "npm";

declare const OPENKAI_RELEASE_KEY: string | undefined;

/** The build-pinned release key (wins over the env). Undefined until a keypair exists. */
export const BUILD_RELEASE_KEY: string | undefined =
	typeof OPENKAI_RELEASE_KEY !== "undefined" ? (OPENKAI_RELEASE_KEY as string) : undefined;

export const DEFAULT_MANIFEST_URL = "https://github.com/Kaidera-AI/OpenKai/releases/latest/download/latest.json";

export const KILL_SWITCH_ENV = "OPENKAI_AUTO_UPDATE_ENABLED";
export const CHANNEL_ENV = "OPENKAI_CHANNEL";
export const MANIFEST_ENV = "OPENKAI_MANIFEST_URL";
export const RELEASE_KEY_ENV = "OPENKAI_RELEASE_PUBLIC_KEY";

/** Brew-managed installs ship the standalone binary, but the package manager
 * owns the lifecycle — self-upgrade must not mutate the Cellar. */
export function isBrewManaged(execPath: string = process.execPath): boolean {
	return /\/(Cellar|linuxbrew|homebrew)\//i.test(execPath);
}

/** Bun-managed installs: the shim runs under the bun binary in ~/.bun, so the
 * package manager owns the lifecycle; self-upgrade defers to `bun add -g`. */
export function isBunManaged(execPath: string = process.execPath, argv1?: string): boolean {
	const script = argv1 ?? process.argv[1] ?? "";
	const bunPath = /(\/\.bun\/|\/install\/global\/node_modules\/)/i;
	return bunPath.test(execPath) || bunPath.test(script);
}

/** Resolve the active channel. `envChannel` is an operator/test override;
 * otherwise the build-time stamp decides. Pure on its inputs. */
export function resolveChannel(opts: { buildChannel: Channel; envChannel?: string }): Channel {
	if (opts.envChannel === "standalone" || opts.envChannel === "npm") return opts.envChannel;
	return opts.buildChannel;
}

/** Kill-switch: anything in { "0","false","no","off" } (case-insensitive)
 * disables auto-upgrade entirely; unset/other values enable it. */
export function resolveAutoUpdateEnabled(envValue: string | undefined): boolean {
	if (envValue === undefined) return true;
	return !["0", "false", "no", "off"].includes(envValue.trim().toLowerCase());
}

/** Detect the current platform's release target (matches build-binaries). */
export function detectTarget(platform: string = process.platform, arch: string = process.arch): string {
	const archName = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : arch;
	return `${platform}-${archName}`;
}

/** Semver-ish comparison: returns -1, 0, or 1. Tolerant of non-numeric parts. */
export function compareVersions(a: string, b: string): number {
	const pa = a.split(".");
	const pb = b.split(".");
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i += 1) {
		const ai = pa[i] ?? "0";
		const bi = pb[i] ?? "0";
		const an = Number(ai);
		const bn = Number(bi);
		if (Number.isFinite(an) && Number.isFinite(bn)) {
			if (an < bn) return -1;
			if (an > bn) return 1;
		} else {
			if (ai < bi) return -1;
			if (ai > bi) return 1;
		}
	}
	return 0;
}

// ─── Manifest + witness ───────────────────────────────────────────────────────

export interface ReleaseArtifact {
	/** Release target, e.g. "darwin-arm64" (matches `detectTarget`). */
	target: string;
	/** Plain HTTPS (or loopback) URL to the binary artifact. */
	url: string;
	/** Lowercase hex SHA-256 of the binary bytes. */
	sha256: string;
}

export interface ReleaseManifest {
	version: string;
	artifacts: ReleaseArtifact[];
	/** Optional hex Ed25519 signature over the canonical manifest bytes. */
	signature?: string;
}

/** Canonical bytes a manifest signature covers (excludes the signature field). */
export function canonicalManifestBytes(manifest: ReleaseManifest): Uint8Array {
	const sorted = {
		version: manifest.version,
		artifacts: [...manifest.artifacts].sort((x, y) => (x.target < y.target ? -1 : x.target > y.target ? 1 : 0)),
	};
	return new TextEncoder().encode(JSON.stringify(sorted));
}

export function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export class WitnessMismatchError extends Error {
	override readonly name = "WitnessMismatchError";
	constructor(
		public readonly kind: "artifact" | "manifest",
		expected: string,
		actual: string,
	) {
		super(`${kind} witness mismatch: expected ${expected}, got ${actual}`);
	}
}

export class AutoUpdateDisabledError extends Error {
	override readonly name = "AutoUpdateDisabledError";
	constructor() {
		super(`auto-update disabled by kill-switch (${KILL_SWITCH_ENV}=false)`);
	}
}

export class NoPreviousBinaryError extends Error {
	override readonly name = "NoPreviousBinaryError";
	constructor(path: string) {
		super(`no previous binary to roll back to at ${path}`);
	}
}

/** Verify an Ed25519 manifest signature. `publicKeyBase64` is a DER SPKI
 * Ed25519 public key (base64). Returns true on valid, false on mismatch;
 * throws only on malformed key material. */
export function verifyManifestSignature(
	manifest: ReleaseManifest,
	publicKeyBase64: string,
	signatureHex: string,
): boolean {
	const key = createPublicKey({
		key: Buffer.from(publicKeyBase64, "base64"),
		format: "der",
		type: "spki",
	});
	return verify(null, canonicalManifestBytes(manifest), key, Buffer.from(signatureHex, "hex"));
}

/** Sign a manifest (test/release-helper — not used in the upgrade path). */
export function signManifest(manifest: ReleaseManifest, privateKeyPem: string): string {
	return sign(null, canonicalManifestBytes(manifest), privateKeyPem).toString("hex");
}

/** Update witness: verifies manifest signature + artifact SHA-256 before swap. */
export class UpdateWitness {
	constructor(private readonly releasePublicKey?: string) {}

	/** Verify the manifest signature when a release key is pinned. Fail-closed:
	 * a pinned key + unsigned/invalid manifest is refused, never skipped. */
	verifyManifest(manifest: ReleaseManifest): void {
		if (!this.releasePublicKey) return; // unpinned → signature opt-in; SHA witness still gates
		if (!manifest.signature) {
			throw new WitnessMismatchError("manifest", "signed manifest", "unsigned");
		}
		if (!verifyManifestSignature(manifest, this.releasePublicKey, manifest.signature)) {
			throw new WitnessMismatchError("manifest", "valid signature", "invalid");
		}
	}

	/** Verify a downloaded artifact's SHA-256 against the manifest. */
	verifyArtifact(artifact: ReleaseArtifact, bytes: Uint8Array): void {
		const actual = sha256Hex(bytes);
		if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) {
			throw new WitnessMismatchError("artifact", artifact.sha256, actual);
		}
	}
}

// ─── Injectable deps ──────────────────────────────────────────────────────────

export interface UpgradeDeps {
	fetchManifest(url: string): Promise<ReleaseManifest>;
	download(url: string): Promise<Uint8Array>;
	readFile(path: string): Promise<Uint8Array>;
	writeFile(path: string, data: Uint8Array): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	copyFile(from: string, to: string): Promise<void>;
	chmod(path: string, mode: number): Promise<void>;
	stat(path: string): Promise<{ isFile: boolean }>;
}

// ─── Upgrader (standalone channel only) ──────────────────────────────────────

export interface UpgraderOptions {
	manifestUrl: string;
	currentBinary: string;
	currentVersion: string;
	target: string;
	autoUpdateEnabled: boolean;
	releasePublicKey?: string;
	deps: UpgradeDeps;
}

export interface CheckResult {
	manifest: ReleaseManifest;
	artifact: ReleaseArtifact | undefined;
	latest: string;
	updateAvailable: boolean;
}

export interface UpgradeResult {
	alreadyUpToDate: boolean;
	from: string;
	to: string;
	artifact?: ReleaseArtifact;
	previousBinary: string;
}

export interface RollbackResult {
	from: string;
	to: string;
	previousBinary: string;
}

/**
 * Standalone-channel binary upgrader. The npm channel never constructs this
 * class — npm installs never self-mutate.
 *
 * Layout next to the running binary:
 *   <binary>            — the active standalone binary
 *   <binary>.new        — staging path for the downloaded artifact
 *   <binary>.previous   — the prior binary, preserved for rollback
 */
export class Upgrader {
	readonly previousBinary: string;
	private readonly staging: string;
	private readonly witness: UpdateWitness;

	constructor(private readonly opts: UpgraderOptions) {
		this.previousBinary = `${opts.currentBinary}.previous`;
		this.staging = `${opts.currentBinary}.new`;
		this.witness = new UpdateWitness(opts.releasePublicKey);
	}

	private async fetchManifest(): Promise<ReleaseManifest> {
		const manifest = await this.opts.deps.fetchManifest(this.opts.manifestUrl);
		this.witness.verifyManifest(manifest);
		return manifest;
	}

	private findArtifact(manifest: ReleaseManifest): ReleaseArtifact | undefined {
		return manifest.artifacts.find(a => a.target === this.opts.target);
	}

	/** Check for an available update without applying anything. */
	async check(): Promise<CheckResult> {
		const manifest = await this.fetchManifest();
		const artifact = this.findArtifact(manifest);
		const updateAvailable = artifact !== undefined && compareVersions(manifest.version, this.opts.currentVersion) > 0;
		return { manifest, artifact, latest: manifest.version, updateAvailable };
	}

	/** Perform a witnessed upgrade. Refuses when the kill-switch is off, when no
	 * artifact matches the target, when already up-to-date, or when the SHA-256
	 * witness fails. The prior binary is preserved for rollback. */
	async upgrade(): Promise<UpgradeResult> {
		if (!this.opts.autoUpdateEnabled) throw new AutoUpdateDisabledError();
		const result = await this.check();
		if (!result.artifact) {
			throw new Error(`no release artifact for target ${this.opts.target} in manifest`);
		}
		if (!result.updateAvailable) {
			return {
				alreadyUpToDate: true,
				from: this.opts.currentVersion,
				to: this.opts.currentVersion,
				previousBinary: this.previousBinary,
			};
		}

		const bytes = await this.opts.deps.download(result.artifact.url);
		this.witness.verifyArtifact(result.artifact, bytes);

		await this.opts.deps.writeFile(this.staging, bytes);
		await this.opts.deps.chmod(this.staging, 0o755);

		// Preserve the current binary as `.previous` for rollback. copyFile (not
		// rename) so the running process's inode stays valid until the swap.
		try {
			await this.opts.deps.stat(this.opts.currentBinary);
			await this.opts.deps.copyFile(this.opts.currentBinary, this.previousBinary);
		} catch {
			// current binary missing — nothing to preserve; proceed with swap.
		}

		await this.opts.deps.rename(this.staging, this.opts.currentBinary);

		return {
			alreadyUpToDate: false,
			from: this.opts.currentVersion,
			to: result.latest,
			artifact: result.artifact,
			previousBinary: this.previousBinary,
		};
	}

	/** Roll back to the `.previous` binary. Always allowed (recovery path) — not
	 * gated by the kill-switch. The rolled-back-from binary becomes the new
	 * `.previous`, so rollback is reversible (re-roll-forward). */
	async rollback(): Promise<RollbackResult> {
		let prevExists = false;
		try {
			prevExists = (await this.opts.deps.stat(this.previousBinary)).isFile;
		} catch {
			prevExists = false;
		}
		if (!prevExists) throw new NoPreviousBinaryError(this.previousBinary);

		const prevBytes = await this.opts.deps.readFile(this.previousBinary);
		const curBytes = await this.opts.deps.readFile(this.opts.currentBinary);

		await this.opts.deps.writeFile(this.staging, prevBytes);
		await this.opts.deps.chmod(this.staging, 0o755);
		await this.opts.deps.rename(this.staging, this.opts.currentBinary);
		await this.opts.deps.writeFile(this.previousBinary, curBytes);

		return { from: this.opts.currentVersion, to: "(previous)", previousBinary: this.previousBinary };
	}
}
