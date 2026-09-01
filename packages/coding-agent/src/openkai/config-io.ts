/**
 * openkai/config-io (E022 Inc 03) — the layer's config slice, ONE read/write
 * path for every openkai setting: fusion pairs, casts, shift posture/pins.
 *
 * Home: `~/.openkai/config.json` (override with OPENKAI_HOME). The documented
 * surface in casts.ts ("casts" key) and shift-extension's "shift" slice both
 * live here — no second config file, no split brain with the fork's own
 * settings store (which owns upstream settings; we own ours).
 *
 * Discipline: atomic write (tmp + rename), 0600 permissions, tolerant read
 * (a corrupt file reads as empty — the operator fixes it by hand, the TUI
 * never crashes on it).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** The persisted pair selection (provider/model ids, both slots). */
export interface FusionPairConfig {
	architect?: string;
	builder?: string;
}

export interface OpenkaiConfig {
	fusion?: { pair?: FusionPairConfig };
	casts?: unknown[];
	defaultCast?: string;
	shift?: {
		posture?: "quality" | "balanced" | "saver";
		pins?: {
			floor?: Partial<Record<string, "efficient" | "capable">>;
			ceiling?: "efficient" | "capable";
			never?: string[];
		};
	};
}

export function openkaiHome(): string {
	return Bun.env.OPENKAI_HOME ?? path.join(os.homedir(), ".openkai");
}

export function openkaiConfigPath(): string {
	return path.join(openkaiHome(), "config.json");
}

/** Tolerant read: missing or corrupt → empty config (never throws). */
export async function readOpenkaiConfig(): Promise<OpenkaiConfig> {
	const text = await fs.promises.readFile(openkaiConfigPath(), "utf-8").catch(() => undefined);
	if (text === undefined) return {};
	try {
		const parsed = JSON.parse(text) as unknown;
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as OpenkaiConfig) : {};
	} catch {
		return {};
	}
}

/** Atomic write: tmp file + rename, 0600. */
export async function writeOpenkaiConfig(config: OpenkaiConfig): Promise<void> {
	const file = openkaiConfigPath();
	await fs.promises.mkdir(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp-${process.pid}`;
	await fs.promises.writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
	await fs.promises.rename(tmp, file);
}
