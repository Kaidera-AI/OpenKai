/**
 * openkai upgrade — dual-channel auto-upgrade (ADR OK-8 / E001 Inc 08).
 *
 * Two distribution channels, per the droid pattern (research
 * `2026-08-14-factory-droid-findings.md` §4 "Packaging/auto-upgrade"):
 *
 *   - **standalone** — a per-platform bun-compiled binary that self-upgrades
 *     from a release manifest fetched over plain HTTPS. Honours an env
 *     kill-switch (`OPENKAI_AUTO_UPDATE_ENABLED=false`) that disables
 *     self-upgrade entirely, and supports rollback to the prior binary.
 *   - **npm** — `openkai` installed via npm. The channel is *pinned at
 *     build time*: the published tarball carries a fixed version and never
 *     self-mutates. Upgrade is an explicit `npm install -g openkai@<v>`.
 *
 * Witness verification ships *with* the upgrader (an auto-updating component
 * without it is an attack surface): every artifact is SHA-256 verified before
 * the binary swap, and manifests may be Ed25519-signed (verified when
 * `OPENKAI_RELEASE_PUBLIC_KEY` is set). No cloud-vendor-specific update
 * service is used — only plain HTTPS artifact fetch (cloud-agnostic policy).
 */

import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { promises as fsp } from "node:fs";

import { CLI_VERSION } from "./version.js";

// ─── Build-time channel stamp ──────────────────────────────────────────────
//
// `OPENKAI_BUILD_CHANNEL` is injected by `bun build --compile --define` in
// scripts/build-binaries.sh (`"standalone"`). The npm build never defines it,
// so `typeof` resolves to "undefined" and the channel defaults to "npm" — the
// pinned-by-construction channel. `typeof` on an undeclared global is safe
// (no ReferenceError); the value branch is only evaluated when the define has
// replaced the identifier with a string literal.
declare const OPENKAI_BUILD_CHANNEL: string | undefined;

const DECLARED_BUILD_CHANNEL: string | undefined =
  typeof OPENKAI_BUILD_CHANNEL !== "undefined"
    ? (OPENKAI_BUILD_CHANNEL as string)
    : undefined;

export type Channel = "standalone" | "npm";

/** The channel this build was compiled for (authoritative; set at build time). */
export const BUILD_CHANNEL: Channel =
  DECLARED_BUILD_CHANNEL === "standalone" ? "standalone" : "npm";

export const DEFAULT_MANIFEST_URL = "https://openkai.dev/releases/latest.json";

export const KILL_SWITCH_ENV = "OPENKAI_AUTO_UPDATE_ENABLED";
export const CHANNEL_ENV = "OPENKAI_CHANNEL";
export const MANIFEST_ENV = "OPENKAI_MANIFEST_URL";
export const RELEASE_KEY_ENV = "OPENKAI_RELEASE_PUBLIC_KEY";

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Resolve the active channel. `envChannel` is an operator/test override;
 * otherwise the build-time stamp decides. Pure on its inputs for unit tests.
 */
export function resolveChannel(opts: {
  buildChannel: Channel;
  envChannel?: string;
}): Channel {
  if (opts.envChannel === "standalone" || opts.envChannel === "npm") {
    return opts.envChannel;
  }
  return opts.buildChannel;
}

/**
 * Resolve the kill-switch. Anything in { "0", "false", "no", "off" } (case-
 * insensitive) disables auto-upgrade entirely; unset/other values enable it.
 */
export function resolveAutoUpdateEnabled(envValue: string | undefined): boolean {
  if (envValue === undefined) return true;
  const normalised = envValue.trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(normalised);
}

/** Detect the current platform's release target (matches build-binaries.sh). */
export function detectTarget(
  platform: string = process.platform,
  arch: string = process.arch,
): string {
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

// ─── Manifest + witness ─────────────────────────────────────────────────────

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
    artifacts: [...manifest.artifacts].sort((x, y) =>
      x.target < y.target ? -1 : x.target > y.target ? 1 : 0,
    ),
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
    super("auto-update disabled by kill-switch (OPENKAI_AUTO_UPDATE_ENABLED=false)");
  }
}

export class NoPreviousBinaryError extends Error {
  override readonly name = "NoPreviousBinaryError";
  constructor(path: string) {
    super(`no previous binary to roll back to at ${path}`);
  }
}

/**
 * Verify an Ed25519 manifest signature. `publicKeyBase64` is a DER SPKI
 * Ed25519 public key (base64). Returns true on valid signature, false on
 * mismatch. Throws only on malformed key material.
 */
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
  const data = canonicalManifestBytes(manifest);
  const signature = Buffer.from(signatureHex, "hex");
  return verify(null, data, key, signature);
}

/** Sign a manifest (test/utility helper — not used in the upgrade path). */
export function signManifest(
  manifest: ReleaseManifest,
  privateKeyPem: string,
): string {
  const data = canonicalManifestBytes(manifest);
  return sign(null, data, privateKeyPem).toString("hex");
}

/** Update witness: verifies manifest signature + artifact SHA-256 before swap. */
export class UpdateWitness {
  constructor(private readonly releasePublicKey?: string) {}

  /** Verify the manifest signature when a release key is pinned. */
  verifyManifest(manifest: ReleaseManifest): void {
    if (!this.releasePublicKey) {
      // No key pinned → manifest-signature verification is opt-in. The
      // artifact SHA-256 witness still gates every swap (see verifyArtifact).
      return;
    }
    if (!manifest.signature) {
      throw new WitnessMismatchError("manifest", "signed manifest", "unsigned");
    }
    const ok = verifyManifestSignature(
      manifest,
      this.releasePublicKey,
      manifest.signature,
    );
    if (!ok) {
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

// ─── Upgrade deps (injectable for tests) ────────────────────────────────────

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

export const defaultDeps: UpgradeDeps = {
  fetchManifest: async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`manifest fetch failed: ${res.status} ${url}`);
    }
    return (await res.json()) as ReleaseManifest;
  },
  download: async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`artifact fetch failed: ${res.status} ${url}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  },
  readFile: (p) => fsp.readFile(p),
  writeFile: (p, d) => fsp.writeFile(p, d),
  rename: (from, to) => fsp.rename(from, to),
  copyFile: (from, to) => fsp.copyFile(from, to),
  chmod: (p, m) => fsp.chmod(p, m),
  stat: async (p) => {
    const s = await fsp.stat(p);
    return { isFile: s.isFile() };
  },
};

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
 * Standalone-channel binary upgrader. The npm channel is handled upstream
 * (runUpgrade) and never constructs this class — npm installs never
 * self-mutate.
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

  private async fetchManifestFor(version?: string): Promise<ReleaseManifest> {
    const url = version
      ? manifestUrlForVersion(this.opts.manifestUrl, version)
      : this.opts.manifestUrl;
    const manifest = await this.opts.deps.fetchManifest(url);
    this.witness.verifyManifest(manifest);
    return manifest;
  }

  private findArtifact(manifest: ReleaseManifest): ReleaseArtifact | undefined {
    return manifest.artifacts.find((a) => a.target === this.opts.target);
  }

  /** Check for an available update without applying anything. */
  async check(version?: string): Promise<CheckResult> {
    const manifest = await this.fetchManifestFor(version);
    const artifact = this.findArtifact(manifest);
    const updateAvailable =
      artifact !== undefined &&
      compareVersions(manifest.version, this.opts.currentVersion) > 0;
    return {
      manifest,
      artifact,
      latest: manifest.version,
      updateAvailable,
    };
  }

  /**
   * Perform a witnessed upgrade. Refuses when the kill-switch is off, when
   * no artifact matches the current target, when already up-to-date, or when
   * the SHA-256 witness fails. The prior binary is preserved for rollback.
   */
  async upgrade(version?: string): Promise<UpgradeResult> {
    if (!this.opts.autoUpdateEnabled) {
      throw new AutoUpdateDisabledError();
    }
    const result = await this.check(version);
    if (!result.artifact) {
      throw new Error(
        `no release artifact for target ${this.opts.target} in manifest`,
      );
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

    // Stage the new binary, make it executable, then swap atomically.
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

  /**
   * Roll back to the `.previous` binary. Always allowed (recovery path) —
   * not gated by the kill-switch, so an operator can recover even when
   * auto-update is disabled. The rolled-back-from binary becomes the new
   * `.previous`, so rollback is reversible (re-roll-forward).
   */
  async rollback(): Promise<RollbackResult> {
    let prevExists: boolean;
    try {
      const st = await this.opts.deps.stat(this.previousBinary);
      prevExists = st.isFile;
    } catch {
      prevExists = false;
    }
    if (!prevExists) {
      throw new NoPreviousBinaryError(this.previousBinary);
    }

    const prevBytes = await this.opts.deps.readFile(this.previousBinary);
    const curBytes = await this.opts.deps.readFile(this.opts.currentBinary);

    // Stage previous, swap into place, then save the old current as the new
    // previous (enables a reversible re-roll-forward).
    await this.opts.deps.writeFile(this.staging, prevBytes);
    await this.opts.deps.chmod(this.staging, 0o755);
    await this.opts.deps.rename(this.staging, this.opts.currentBinary);
    await this.opts.deps.writeFile(this.previousBinary, curBytes);

    return {
      from: this.opts.currentVersion,
      to: "(previous)",
      previousBinary: this.previousBinary,
    };
  }
}

/** Build a version-specific manifest URL from a base (latest) URL. */
export function manifestUrlForVersion(base: string, version: string): string {
  if (base.includes("latest.json")) {
    return base.replace("latest.json", `${version}.json`);
  }
  return `${base.replace(/\/$/, "")}/${version}.json`;
}

// ─── CLI runner ──────────────────────────────────────────────────────────────

export interface UpgradeCliOptions {
  check?: boolean;
  rollback?: boolean;
  version?: string;
  manifestUrl?: string;
  /** Test/programmatic overrides (default: process.env + process.execPath). */
  env?: Record<string, string | undefined>;
  deps?: UpgradeDeps;
  currentBinary?: string;
  currentVersion?: string;
  target?: string;
}

export interface UpgradeRunResult {
  exitCode: number;
  message: string;
  channel: Channel;
  autoUpdateEnabled: boolean;
}

interface ResolvedContext {
  channel: Channel;
  autoUpdateEnabled: boolean;
  manifestUrl: string;
  currentBinary: string;
  currentVersion: string;
  target: string;
  releasePublicKey?: string;
  deps: UpgradeDeps;
}

function resolveContext(options: UpgradeCliOptions): ResolvedContext {
  const env = options.env ?? process.env;
  const channel = resolveChannel({
    buildChannel: BUILD_CHANNEL,
    envChannel: env[CHANNEL_ENV],
  });
  const autoUpdateEnabled = resolveAutoUpdateEnabled(env[KILL_SWITCH_ENV]);
  const manifestUrl =
    options.manifestUrl ?? env[MANIFEST_ENV] ?? DEFAULT_MANIFEST_URL;
  const currentBinary = options.currentBinary ?? process.execPath;
  const currentVersion = options.currentVersion ?? CLI_VERSION;
  const target = options.target ?? detectTarget();
  const releasePublicKey = env[RELEASE_KEY_ENV];
  return {
    channel,
    autoUpdateEnabled,
    manifestUrl,
    currentBinary,
    currentVersion,
    target,
    releasePublicKey,
    deps: options.deps ?? defaultDeps,
  };
}

/** `openkai upgrade` CLI entry point. Returns an exit code + message. */
export async function runUpgrade(
  options: UpgradeCliOptions,
): Promise<UpgradeRunResult> {
  const ctx = resolveContext(options);

  // npm channel: pinned at build time, never self-mutates.
  if (ctx.channel === "npm") {
    const message = [
      `openkai upgrade — channel: npm (pinned at build time)`,
      `npm installs never self-mutate. Upgrade explicitly with:`,
      `  npm install -g openkai@<version>`,
    ].join("\n");
    return { exitCode: 0, message, channel: "npm", autoUpdateEnabled: false };
  }

  // `OPENKAI_CHANNEL=standalone` must not re-enter the self-mutating path on a
  // build that is not a compiled standalone binary. Under a host interpreter
  // `process.execPath` is *node*, not an openkai binary, so the swap would
  // overwrite the user's node install with a release artifact — the witness
  // verifies the bytes, but nothing else verifies the destination. Callers that
  // pass an explicit `currentBinary` (tests, embedders) are unaffected.
  if (BUILD_CHANNEL !== "standalone" && options.currentBinary === undefined) {
    const message = [
      `openkai upgrade — refusing standalone self-upgrade: this build is not a`,
      `standalone binary (${CHANNEL_ENV}=standalone was set on an npm build).`,
      `Self-upgrade here would overwrite ${ctx.currentBinary}, not an openkai binary.`,
      `Upgrade explicitly with: npm install -g openkai@<version>`,
    ].join("\n");
    return {
      exitCode: 1,
      message,
      channel: ctx.channel,
      autoUpdateEnabled: ctx.autoUpdateEnabled,
    };
  }

  const upgrader = new Upgrader({
    manifestUrl: ctx.manifestUrl,
    currentBinary: ctx.currentBinary,
    currentVersion: ctx.currentVersion,
    target: ctx.target,
    autoUpdateEnabled: ctx.autoUpdateEnabled,
    releasePublicKey: ctx.releasePublicKey,
    deps: ctx.deps,
  });

  // --rollback: recovery path, never gated by the kill-switch.
  if (options.rollback) {
    try {
      const result = await upgrader.rollback();
      const message = [
        `rollback complete: ${result.from} → previous binary`,
        `previous binary preserved at ${result.previousBinary}`,
        `restart openkai to run the restored binary.`,
      ].join("\n");
      return {
        exitCode: 0,
        message,
        channel: ctx.channel,
        autoUpdateEnabled: ctx.autoUpdateEnabled,
      };
    } catch (error) {
      const message = `rollback failed: ${error instanceof Error ? error.message : String(error)}`;
      return {
        exitCode: 1,
        message,
        channel: ctx.channel,
        autoUpdateEnabled: ctx.autoUpdateEnabled,
      };
    }
  }

  // --check: read-only diagnostic; reports kill-switch state + availability.
  if (options.check) {
    try {
      const result = await upgrader.check(options.version);
      const lines: string[] = [
        `openkai upgrade — channel: standalone`,
        `auto-update: ${ctx.autoUpdateEnabled ? "enabled" : `disabled (${KILL_SWITCH_ENV}=false)`}`,
        `current: ${ctx.currentVersion}`,
        `latest: ${result.latest}`,
      ];
      if (!result.artifact) {
        lines.push(`artifact: none for target ${ctx.target}`);
      } else {
        lines.push(
          `artifact: ${result.artifact.target} (sha256 ${result.artifact.sha256.slice(0, 12)}…)`,
        );
      }
      lines.push(
        result.updateAvailable ? "update available: yes" : "update available: no",
      );
      return {
        exitCode: 0,
        message: lines.join("\n"),
        channel: ctx.channel,
        autoUpdateEnabled: ctx.autoUpdateEnabled,
      };
    } catch (error) {
      const message = `check failed: ${error instanceof Error ? error.message : String(error)}`;
      return {
        exitCode: 1,
        message,
        channel: ctx.channel,
        autoUpdateEnabled: ctx.autoUpdateEnabled,
      };
    }
  }

  // upgrade: gated by the kill-switch.
  if (!ctx.autoUpdateEnabled) {
    const message = [
      `openkai upgrade — auto-update disabled (${KILL_SWITCH_ENV}=false)`,
      `self-upgrade refused. Re-enable by unsetting ${KILL_SWITCH_ENV},`,
      `or recover with \`openkai upgrade --rollback\`.`,
    ].join("\n");
    return { exitCode: 1, message, channel: ctx.channel, autoUpdateEnabled: false };
  }

  try {
    const result = await upgrader.upgrade(options.version);
    if (result.alreadyUpToDate) {
      const message = `already up-to-date: ${result.from}`;
      return {
        exitCode: 0,
        message,
        channel: ctx.channel,
        autoUpdateEnabled: ctx.autoUpdateEnabled,
      };
    }
    const message = [
      `verifying manifest… ok`,
      result.artifact
        ? `downloading ${result.artifact.target} (${result.to})…`
        : `downloading (${result.to})…`,
      `witness: sha256 verified`,
      `swapping binary: ${result.from} → ${result.to}`,
      `previous binary preserved at ${result.previousBinary}`,
      `upgrade complete: ${result.to}`,
      `restart openkai to run the new binary.`,
    ].join("\n");
    return {
      exitCode: 0,
      message,
      channel: ctx.channel,
      autoUpdateEnabled: ctx.autoUpdateEnabled,
    };
  } catch (error) {
    if (error instanceof WitnessMismatchError) {
      return {
        exitCode: 1,
        message: `upgrade refused: ${error.message}`,
        channel: ctx.channel,
        autoUpdateEnabled: ctx.autoUpdateEnabled,
      };
    }
    const message = `upgrade failed: ${error instanceof Error ? error.message : String(error)}`;
    return {
      exitCode: 1,
      message,
      channel: ctx.channel,
      autoUpdateEnabled: ctx.autoUpdateEnabled,
    };
  }
}