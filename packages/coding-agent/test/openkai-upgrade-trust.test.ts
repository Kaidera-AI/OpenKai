/**
 * E022 Inc 04 gate — release trust-root on the fork (ported from the
 * security-audited 0.84 line):
 *  1. Channel detection: brew/bun/binary classification + env override.
 *  2. The Ed25519 witness: pinned key fails closed on unsigned/invalid
 *     manifests; unpinned → SHA-256 artifact witness still gates every swap.
 *  3. The upgrade swap preserves `.previous`; rollback restores it and is
 *     reversible (re-roll-forward).
 *  4. Kill-switch refuses upgrade but never rollback.
 * All deps injected — no network, no real binary swaps.
 */

import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";

import {
	AutoUpdateDisabledError,
	BUILD_CHANNEL,
	compareVersions,
	detectTarget,
	isBrewManaged,
	isBunManaged,
	NoPreviousBinaryError,
	type ReleaseArtifact,
	type ReleaseManifest,
	resolveAutoUpdateEnabled,
	resolveChannel,
	sha256Hex,
	signManifest,
	UpdateWitness,
	type UpgradeDeps,
	Upgrader,
	WitnessMismatchError,
} from "../src/openkai/upgrade-trust";

/** In-memory fake of the upgrader's I/O deps. */
function fakeDeps(manifest: ReleaseManifest, artifactBytes: Uint8Array) {
	const files = new Map<string, Uint8Array>();
	const log: string[] = [];
	const deps: UpgradeDeps = {
		fetchManifest: async () => structuredClone(manifest),
		download: async () => artifactBytes.slice(),
		readFile: async p => {
			const b = files.get(p);
			if (b === undefined) throw new Error(`ENOENT ${p}`);
			return b;
		},
		writeFile: async (p, d) => {
			files.set(p, d);
			log.push(`write ${p}`);
		},
		rename: async (from, to) => {
			const b = files.get(from);
			if (b === undefined) throw new Error(`ENOENT ${from}`);
			files.delete(from);
			files.set(to, b);
			log.push(`rename ${from} -> ${to}`);
		},
		copyFile: async (from, to) => {
			const b = files.get(from);
			if (b === undefined) throw new Error(`ENOENT ${from}`);
			files.set(to, b.slice());
		},
		chmod: async () => {},
		stat: async p => ({ isFile: files.has(p) }),
	};
	return { deps, files, log };
}

const KEY = generateKeyPairSync("ed25519");
const publicKeyBase64 = KEY.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const privateKeyPem = KEY.privateKey.export({ format: "pem", type: "pkcs8" }) as string;

function makeManifest(artifactBytes: Uint8Array, signed: boolean): ReleaseManifest {
	const artifact: ReleaseArtifact = {
		target: detectTarget(),
		url: "https://example.invalid/openkai-new",
		sha256: sha256Hex(artifactBytes),
	};
	const manifest: ReleaseManifest = { version: "0.2.0", artifacts: [artifact] };
	if (signed) manifest.signature = signManifest(manifest, privateKeyPem);
	return manifest;
}

describe("E022 Inc 04: channel detection", () => {
	test("brew-managed paths are recognised", () => {
		expect(isBrewManaged("/opt/homebrew/Cellar/openkai/0.1.10/bin/openkai")).toBe(true);
		expect(isBrewManaged("/usr/local/bin/openkai")).toBe(false);
	});
	test("bun-managed installs are recognised", () => {
		expect(isBunManaged("/Users/x/.bun/bin/bun", "/Users/x/.bun/install/global/node_modules/.bin/openkai")).toBe(
			true,
		);
		expect(isBunManaged("/usr/local/bin/openkai", "/usr/local/bin/openkai")).toBe(false);
	});
	test("env channel overrides the build stamp", () => {
		expect(resolveChannel({ buildChannel: "npm", envChannel: "standalone" })).toBe("standalone");
		expect(resolveChannel({ buildChannel: "standalone", envChannel: "bogus" })).toBe("standalone");
		expect(resolveChannel({ buildChannel: BUILD_CHANNEL })).toBe(BUILD_CHANNEL);
	});
	test("the kill-switch vocabulary", () => {
		for (const off of ["0", "false", "NO", "off", " OFF "]) {
			expect(resolveAutoUpdateEnabled(off)).toBe(false);
		}
		expect(resolveAutoUpdateEnabled(undefined)).toBe(true);
		expect(resolveAutoUpdateEnabled("yes")).toBe(true);
	});
	test("version comparison", () => {
		expect(compareVersions("0.1.10", "0.1.9")).toBe(1);
		expect(compareVersions("0.1.10", "0.1.10")).toBe(0);
		expect(compareVersions("0.1.9", "0.2.0")).toBe(-1);
	});
});

describe("E022 Inc 04: the Ed25519 witness", () => {
	const bytes = new TextEncoder().encode("binary-v2");

	test("pinned key: unsigned manifest refused fail-closed", () => {
		const witness = new UpdateWitness(publicKeyBase64);
		expect(() => witness.verifyManifest(makeManifest(bytes, false))).toThrow(WitnessMismatchError);
	});

	test("pinned key: tampered manifest refused", () => {
		const witness = new UpdateWitness(publicKeyBase64);
		const manifest = makeManifest(bytes, true);
		manifest.version = "9.9.9"; // tamper after signing
		expect(() => witness.verifyManifest(manifest)).toThrow(WitnessMismatchError);
	});

	test("pinned key: signed manifest verifies", () => {
		const witness = new UpdateWitness(publicKeyBase64);
		expect(() => witness.verifyManifest(makeManifest(bytes, true))).not.toThrow();
	});

	test("unpinned: signature skipped, artifact witness still gates", () => {
		const witness = new UpdateWitness(undefined);
		expect(() => witness.verifyManifest(makeManifest(bytes, false))).not.toThrow();
		const artifact = makeManifest(bytes, false).artifacts[0]!;
		expect(() => witness.verifyArtifact(artifact, bytes)).not.toThrow();
		expect(() => witness.verifyArtifact(artifact, new TextEncoder().encode("binary-EVIL"))).toThrow(
			WitnessMismatchError,
		);
	});
});

describe("E022 Inc 04: witnessed upgrade + reversible rollback", () => {
	const oldBytes = new TextEncoder().encode("binary-v1");
	const newBytes = new TextEncoder().encode("binary-v2");

	function makeUpgrader(opts?: { killSwitch?: boolean; releaseKey?: string }) {
		const { deps, files } = fakeDeps(makeManifest(newBytes, true), newBytes);
		files.set("/bin/openkai", oldBytes);
		const upgrader = new Upgrader({
			manifestUrl: "https://example.invalid/latest.json",
			currentBinary: "/bin/openkai",
			currentVersion: "0.1.10",
			target: detectTarget(),
			autoUpdateEnabled: opts?.killSwitch !== true,
			...(opts?.releaseKey !== undefined ? { releasePublicKey: opts.releaseKey } : {}),
			deps,
		});
		return { upgrader, files };
	}

	test("upgrade preserves the previous binary", async () => {
		const { upgrader, files } = makeUpgrader({ releaseKey: publicKeyBase64 });
		const result = await upgrader.upgrade();
		expect(result.alreadyUpToDate).toBe(false);
		expect(result.to).toBe("0.2.0");
		expect(Buffer.from(files.get("/bin/openkai")!).toString()).toBe("binary-v2");
		expect(Buffer.from(files.get("/bin/openkai.previous")!).toString()).toBe("binary-v1");
	});

	test("rollback restores the previous binary and is reversible", async () => {
		const { upgrader, files } = makeUpgrader({ releaseKey: publicKeyBase64 });
		await upgrader.upgrade();
		const rb = await upgrader.rollback();
		expect(rb.to).toBe("(previous)");
		expect(Buffer.from(files.get("/bin/openkai")!).toString()).toBe("binary-v1");
		// re-roll-forward: the rolled-back-from binary is the new .previous
		expect(Buffer.from(files.get("/bin/openkai.previous")!).toString()).toBe("binary-v2");
	});

	test("rollback without a previous binary names the error", async () => {
		const { upgrader } = makeUpgrader();
		let caught: unknown;
		try {
			await upgrader.rollback();
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(NoPreviousBinaryError);
	});

	test("kill-switch refuses upgrade but never rollback", async () => {
		const { upgrader, files } = makeUpgrader({ killSwitch: true, releaseKey: publicKeyBase64 });
		let caught: unknown;
		try {
			await upgrader.upgrade();
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(AutoUpdateDisabledError);
		// simulate a prior upgrade having left a .previous
		files.set("/bin/openkai.previous", oldBytes);
		const rolled = await upgrader.rollback();
		expect(rolled.to).toBe("(previous)");
	});

	test("pinned key + unsigned manifest refuses the whole upgrade", async () => {
		const unsigned = makeManifest(newBytes, false);
		const { deps, files } = fakeDeps(unsigned, newBytes);
		files.set("/bin/openkai", oldBytes);
		const upgrader = new Upgrader({
			manifestUrl: "https://example.invalid/latest.json",
			currentBinary: "/bin/openkai",
			currentVersion: "0.1.10",
			target: detectTarget(),
			autoUpdateEnabled: true,
			releasePublicKey: publicKeyBase64,
			deps,
		});
		let caught: unknown;
		try {
			await upgrader.upgrade();
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(WitnessMismatchError);
	});

	test("a wrong-SHA artifact is refused before any swap", async () => {
		const manifest = makeManifest(newBytes, true);
		manifest.artifacts[0]!.sha256 = sha256Hex(new TextEncoder().encode("binary-TAMPERED"));
		const { deps, files } = fakeDeps(manifest, newBytes);
		files.set("/bin/openkai", oldBytes);
		const upgrader = new Upgrader({
			manifestUrl: "https://example.invalid/latest.json",
			currentBinary: "/bin/openkai",
			currentVersion: "0.1.10",
			target: detectTarget(),
			autoUpdateEnabled: true,
			releasePublicKey: publicKeyBase64,
			deps,
		});
		let caught: unknown;
		try {
			await upgrader.upgrade();
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(WitnessMismatchError);
		// nothing swapped
		expect(Buffer.from(files.get("/bin/openkai")!).toString()).toBe("binary-v1");
	});

	test("already up-to-date is a no-op result", async () => {
		const manifest = makeManifest(newBytes, true);
		manifest.version = "0.1.10"; // same as current
		const { deps, files } = fakeDeps(manifest, newBytes);
		files.set("/bin/openkai", oldBytes);
		const upgrader = new Upgrader({
			manifestUrl: "https://example.invalid/latest.json",
			currentBinary: "/bin/openkai",
			currentVersion: "0.1.10",
			target: detectTarget(),
			autoUpdateEnabled: true,
			deps,
		});
		const result = await upgrader.upgrade();
		expect(result.alreadyUpToDate).toBe(true);
	});
});

describe("E022 Inc 06 (REN-03/05): target + prerelease hardening", () => {
	test("detectTarget emits the musl id when the binary is musl-linked", () => {
		expect(detectTarget("linux", "x64", true)).toBe("linux-musl-x64");
		expect(detectTarget("linux", "arm64", true)).toBe("linux-musl-arm64");
		expect(detectTarget("linux", "x64", false)).toBe("linux-x64");
		expect(detectTarget("darwin", "arm64", true)).toBe("darwin-arm64"); // musl never on darwin
	});

	test("a prerelease in the manifest never reads as newer than the same base", () => {
		expect(compareVersions("0.1.10", "0.1.10-rc.1")).toBe(1);
		expect(compareVersions("0.1.10-rc.1", "0.1.10")).toBe(-1);
		expect(compareVersions("0.1.10-rc.1", "0.1.10-rc.1")).toBe(0);
		expect(compareVersions("0.1.10-rc.2", "0.1.10-rc.10")).toBe(-1);
	});
});
