/**
 * E022 Inc 01 gate — theme contract + brand completeness.
 *
 * Pins (all executable, no trust):
 *  1. Explicit theme contract: --theme flag > OPENKAI_THEME env > detection.
 *     Names pin (appearance flips never re-resolve); dark/light lock the
 *     mapping; auto/empty falls through to OSC 11/COLORFGBG detection.
 *  2. First paint is Kaidera: schema defaults are kaidera-dark/kaidera-light,
 *     so `initTheme:final` (Settings.get falls back to schema defaults) can
 *     never resurrect titanium over the fork default.
 *  3. Splash every launch: startup.showSplash defaults true; the splash mark
 *     is the Kaidera sharp hexagon and the wordmark reads OpenKai.
 *  4. Status-line glyph: the kaidera themes override icon.omp to ⬣.
 *  5. Golden first frames: renderSetupSplash bytes per theme match the
 *     committed fixtures (the pty-spawn frame contract, rendered at the seam).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { SETTINGS_SCHEMA } from "../src/config/settings-schema";
import { KAIDERA_MARK, KAIDERA_GLYPH, OPENKAI_WORDMARK } from "../src/openkai/brand";
import { PI_LOGO } from "../src/modes/components/welcome";
import { renderSetupSplash, SETUP_SPLASH_MS } from "../src/modes/setup-wizard/scenes/splash";
import {
	applyFlagThemeOverride,
	getCurrentThemeName,
	getExplicitThemeContract,
	getThemeByName,
	initThemeSync,
	onTerminalAppearanceChange,
	parseExplicitThemeValue,
	resetExplicitThemeForTest,
} from "../src/modes/theme/theme";

const FIXTURE_DIR = path.join(import.meta.dir, "fixtures", "e022-theme-golden");

function clearEnvTheme(): void {
	delete Bun.env.OPENKAI_THEME;
}

beforeAll(() => clearEnvTheme());
afterAll(() => {
	clearEnvTheme();
	resetExplicitThemeForTest();
});

describe("E022 Inc 01: explicit theme contract", () => {
	test("parseExplicitThemeValue: name pins, dark/light lock, auto/empty fall through", () => {
		expect(parseExplicitThemeValue("kaidera-light")).toEqual({ pin: "kaidera-light" });
		expect(parseExplicitThemeValue("titanium")).toEqual({ pin: "titanium" });
		expect(parseExplicitThemeValue("dark")).toEqual({ lock: "dark" });
		expect(parseExplicitThemeValue("light")).toEqual({ lock: "light" });
		expect(parseExplicitThemeValue("auto")).toBeUndefined();
		expect(parseExplicitThemeValue("")).toBeUndefined();
		expect(parseExplicitThemeValue("  kaidera-dark  ")).toEqual({ pin: "kaidera-dark" });
	});

	test("--theme flag pins the theme across initThemeSync", () => {
		resetExplicitThemeForTest();
		clearEnvTheme();
		applyFlagThemeOverride("kaidera-light");
		// Dark-terminal defaults would otherwise win: the pin must override.
		initThemeSync();
		expect(getCurrentThemeName()).toBe("kaidera-light");
		const contract = getExplicitThemeContract();
		expect(contract?.pin).toBe("kaidera-light");
		expect(contract?.source).toBe("flag");
	});

	test("OPENKAI_THEME env applies when no flag is set", () => {
		resetExplicitThemeForTest();
		Bun.env.OPENKAI_THEME = "kaidera-light";
		initThemeSync();
		expect(getCurrentThemeName()).toBe("kaidera-light");
		expect(getExplicitThemeContract()?.source).toBe("env");
		clearEnvTheme();
	});

	test("flag wins over env", () => {
		resetExplicitThemeForTest();
		Bun.env.OPENKAI_THEME = "titanium";
		applyFlagThemeOverride("kaidera-light");
		initThemeSync();
		expect(getCurrentThemeName()).toBe("kaidera-light");
		clearEnvTheme();
	});

	test("a pinned theme survives a terminal appearance flip", () => {
		resetExplicitThemeForTest();
		clearEnvTheme();
		applyFlagThemeOverride("kaidera-dark");
		initThemeSync();
		expect(getCurrentThemeName()).toBe("kaidera-dark");
		// The terminal reports a light background — the pin must hold.
		onTerminalAppearanceChange("light");
		expect(getCurrentThemeName()).toBe("kaidera-dark");
	});

	test("no contract: the fork default is Kaidera (not titanium)", () => {
		resetExplicitThemeForTest();
		clearEnvTheme();
		initThemeSync();
		expect(getCurrentThemeName()).toBe("kaidera-dark");
	});
});

describe("E022 Inc 01: first-paint defaults (the titanium fix)", () => {
	test("schema defaults are the Kaidera pair", () => {
		expect(SETTINGS_SCHEMA["theme.dark"].default).toBe("kaidera-dark");
		expect(SETTINGS_SCHEMA["theme.light"].default).toBe("kaidera-light");
	});

	test("splash shows on every launch by default", () => {
		expect(SETTINGS_SCHEMA["startup.showSplash"].default).toBe(true);
	});
});

describe("E022 Inc 01: brand surfaces", () => {
	test("the splash/welcome brand mark is the Kaidera hexagon", () => {
		expect([...PI_LOGO]).toEqual([...KAIDERA_MARK]);
		const joined = PI_LOGO.join("\n");
		expect(joined).toContain("/\\");
		expect(joined).toContain("\\/");
		expect(joined).not.toContain("█"); // no π block-glyphs remain
	});

	test("the compact splash wordmark reads OpenKai", async () => {
		resetExplicitThemeForTest();
		clearEnvTheme();
		initThemeSync();
		// Below MIN_SCENE_WIDTH/HEIGHT the splash collapses to the compact mark.
		const frame = renderSetupSplash(40, 12, Math.floor(SETUP_SPLASH_MS / 2)).join("\n");
		expect(frame).toContain(OPENKAI_WORDMARK);
	});

	test("kaidera themes carry the ⬣ status-line glyph", async () => {
		for (const name of ["kaidera-dark", "kaidera-light"]) {
			const theme = await getThemeByName(name);
			if (!theme) throw new Error(`theme ${name} missing`);
			expect(theme.symbol("icon.omp")).toBe(KAIDERA_GLYPH);
		}
	});
});

describe("E022 Inc 01: golden first frames", () => {
	test("renderSetupSplash bytes per theme match the committed fixtures", async () => {
		for (const name of ["kaidera-dark", "kaidera-light"]) {
			resetExplicitThemeForTest();
			clearEnvTheme();
			applyFlagThemeOverride(name);
			initThemeSync();
			expect(getCurrentThemeName()).toBe(name);
			// Settled frame (progress = 1) at a standard terminal size.
			const frame = renderSetupSplash(80, 24, SETUP_SPLASH_MS).join("\n");
			const fixture = path.join(FIXTURE_DIR, `splash-${name}.txt`);
			const expected = fs.readFileSync(fixture, "utf8");
			expect(frame).toBe(expected);
		}
	});
});
