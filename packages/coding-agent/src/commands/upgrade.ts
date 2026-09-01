/**
 * `openkai upgrade` (E022 Inc 04) — the channel-aware upgrade with the
 * 0.84 line's certified trust root on the standalone channel:
 *
 *   brew        → the package manager owns the binary: print the right
 *                 command, never self-mutate.
 *   bun/npm     → the package manager owns the lifecycle: defer to
 *                 `bun add -g` / `npm i -g` (the 0.1.9 idiom).
 *   standalone  → the witnessed upgrader: Ed25519 manifest verification
 *                 (fail-closed when a release key is pinned), SHA-256
 *                 artifact witness, `.previous` sidecar, `--rollback`.
 *
 * Flags mirror the 0.84 registry row: `--check` is read-only; `--rollback`
 * is the recovery path (allowed even when the kill-switch is off).
 */

import * as fsp from "node:fs/promises";

import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { upgradeHelp as commandHelp } from "../cli/command-help";
import { PRODUCT_VERSION } from "../openkai/brand";
import {
	BUILD_CHANNEL,
	BUILD_RELEASE_KEY,
	CHANNEL_ENV,
	DEFAULT_MANIFEST_URL,
	detectTarget,
	isBrewManaged,
	isBunManaged,
	KILL_SWITCH_ENV,
	MANIFEST_ENV,
	RELEASE_KEY_ENV,
	type ReleaseManifest,
	resolveAutoUpdateEnabled,
	resolveChannel,
	type UpgradeDeps,
	Upgrader,
} from "../openkai/upgrade-trust";

const defaultDeps: UpgradeDeps = {
	fetchManifest: async url => {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`manifest fetch failed: ${res.status} ${url}`);
		return (await res.json()) as ReleaseManifest;
	},
	download: async url => {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`artifact fetch failed: ${res.status} ${url}`);
		return new Uint8Array(await res.arrayBuffer());
	},
	readFile: p => fsp.readFile(p),
	writeFile: (p, d) => fsp.writeFile(p, d),
	rename: (from, to) => fsp.rename(from, to),
	copyFile: (from, to) => fsp.copyFile(from, to),
	chmod: (p, m) => fsp.chmod(p, m),
	stat: async p => {
		const s = await fsp.stat(p);
		return { isFile: s.isFile() };
	},
};

function say(line: string): void {
	process.stdout.write(`${line}\n`);
}

export default class Upgrade extends Command {
	static description = commandHelp.description;
	static flags = {
		check: Flags.boolean({ char: "c", description: "Check for updates without installing", default: false }),
		rollback: Flags.boolean({
			char: "r",
			description: "Roll back to the previous binary (standalone only)",
			default: false,
		}),
	};

	static examples = ["openkai upgrade", "openkai upgrade --check", "openkai upgrade --rollback"];

	async run(): Promise<void> {
		const { flags } = await this.parse(Upgrade);
		const channel = resolveChannel({ buildChannel: BUILD_CHANNEL, envChannel: Bun.env[CHANNEL_ENV] });

		// Managed channels: the package manager owns the binary lifecycle.
		if (isBrewManaged()) {
			say("openkai is brew-managed — upgrade with: brew upgrade openkai");
			return;
		}
		if (isBunManaged()) {
			say("openkai is bun-managed — upgrade with: bun add -g @kaidera/openkai");
			return;
		}
		if (channel === "npm") {
			say("openkai is npm-managed — upgrade with: npm install -g @kaidera/openkai");
			return;
		}
		// REN-02 (E022 Inc 06 adversarial): the witnessed swap renames the
		// downloaded artifact over process.execPath. Only a compiled OpenKai
		// binary may be the swap target — under a script launch (node/bun
		// running the CLI) execPath is the runtime itself, and the env channel
		// override would clobber it. The compile step stamps PI_COMPILED
		// (define), so its absence means "not a standalone binary" regardless
		// of the env override.
		if (process.env.PI_COMPILED !== "true") {
			say(
				"openkai upgrade (standalone) needs the compiled binary; this install is package-managed — use its package manager.",
			);
			return;
		}

		const releaseKey = BUILD_RELEASE_KEY ?? Bun.env[RELEASE_KEY_ENV];
		if (releaseKey === undefined) {
			say("warning: no release key pinned — manifest signatures are NOT verified (SHA-256 witness still gates).");
		}
		const upgrader = new Upgrader({
			manifestUrl: Bun.env[MANIFEST_ENV] ?? DEFAULT_MANIFEST_URL,
			currentBinary: process.execPath,
			currentVersion: PRODUCT_VERSION,
			target: detectTarget(),
			autoUpdateEnabled: resolveAutoUpdateEnabled(Bun.env[KILL_SWITCH_ENV]),
			...(releaseKey !== undefined ? { releasePublicKey: releaseKey } : {}),
			deps: defaultDeps,
		});

		try {
			if (flags.rollback) {
				const result = await upgrader.rollback();
				say(`rolled back: ${result.from} → ${result.to} (${result.previousBinary} is now the rollback target)`);
				return;
			}

			if (flags.check) {
				const result = await upgrader.check();
				say(
					result.updateAvailable
						? `update available: ${PRODUCT_VERSION} → ${result.latest}`
						: `already up to date (${result.latest})`,
				);
				return;
			}

			const result = await upgrader.upgrade();
			if (result.alreadyUpToDate) {
				say(`already up to date (${result.to})`);
				return;
			}
			say(
				`upgraded: ${result.from} → ${result.to} (previous kept at ${result.previousBinary}; rollback: openkai upgrade --rollback)`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			say(`error: ${message}`);
			process.exitCode = 1;
		}
	}
}
