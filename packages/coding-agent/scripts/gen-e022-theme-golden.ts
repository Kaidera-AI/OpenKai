// One-off golden-fixture generator for E022 Inc 01 (not a test).
// Renders the settled splash frame per Kaidera theme into test/fixtures/,
// ANSI-stripped: the golden gate pins splash STRUCTURE, not color escapes
// (capability-dependent — truecolor vs the 256 ramp — CI proved it).
import * as fs from "node:fs";
import * as path from "node:path";
import { renderSetupSplash, SETUP_SPLASH_MS } from "../src/modes/setup-wizard/scenes/splash";
import { applyFlagThemeOverride, initThemeSync, resetExplicitThemeForTest } from "../src/modes/theme/theme";

delete Bun.env.OPENKAI_THEME;
const dir = path.join(import.meta.dir, "..", "test", "fixtures", "e022-theme-golden");
fs.mkdirSync(dir, { recursive: true });
for (const name of ["kaidera-dark", "kaidera-light"]) {
	resetExplicitThemeForTest();
	applyFlagThemeOverride(name);
	initThemeSync();
	const frame = renderSetupSplash(80, 24, SETUP_SPLASH_MS)
		.map(line => Bun.stripANSI(line))
		.join("\n");
	const file = path.join(dir, `splash-${name}.txt`);
	fs.writeFileSync(file, frame, "utf8");
	console.log(`wrote ${file} (${frame.length} bytes)`);
}
