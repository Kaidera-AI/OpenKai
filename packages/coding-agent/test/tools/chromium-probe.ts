import * as fs from "node:fs/promises";
import { ensureChromiumExecutable } from "@oh-my-pi/pi-coding-agent/tools/browser/launch";
import type { BrowserHandle } from "@oh-my-pi/pi-coding-agent/tools/browser/registry";

/**
 * Whether the Chromium puppeteer resolves can actually execute on this host.
 * CI runners without Chrome's system libraries (libnspr4 & co.) hold the
 * downloaded binary but cannot exec it — probe with --version and skip
 * instead of failing.
 */
async function chromiumCanLaunch(): Promise<boolean> {
	try {
		const executable = await ensureChromiumExecutable();
		if (!executable) return false;
		// Only Linux runs the exec probe. Elsewhere the resolved candidate is a
		// GUI application path, and running it is the hazard
		// `isChromiumExecutable()` already refuses for the same reason (#8445): a
		// GUI `chrome.exe --version` prints nothing to a detached stdout and does
		// not exit, so this spawnSync never returns and every importing suite
		// hangs during module evaluation. Check the file instead, so a stale
		// PUPPETEER_EXECUTABLE_PATH — which `ensureChromiumExecutable()` hands
		// back unvalidated — still skips the suites rather than failing them at
		// launch.
		if (process.platform !== "linux") return (await fs.stat(executable)).isFile();
		const probe = Bun.spawnSync([executable, "--version"], { stdout: "ignore", stderr: "ignore" });
		return probe.exitCode === 0;
	} catch {
		return false;
	}
}

let probe: Promise<boolean> | undefined;

/**
 * Gate for tests that launch a real Chromium:
 *
 *     const CHROMIUM_AVAILABLE = await chromiumAvailable();
 *     describe.skipIf(!CHROMIUM_AVAILABLE)(…);
 *
 * The result is a promise rather than an awaited `export const`. A module whose
 * exports are initialized by top-level await hands the test runner a binding
 * that is still in its temporal dead zone when a second test file in the same
 * process imports it, and that file dies during registration with "Cannot
 * access 'CHROMIUM_AVAILABLE' before initialization". Awaiting in the importer
 * makes the wait part of that file's own evaluation, which the runner does
 * sequence. The probe runs once per process.
 */
export function chromiumAvailable(): Promise<boolean> {
	probe ??= chromiumCanLaunch();
	return probe;
}

/**
 * Whether a HEADFUL Chromium can actually serve the visible-tab suite on
 * this host (E022 Inc 06, the recorded disposition for the upstream-
 * inherited CI gap). On Linux the suite needs a real windowing surface: a
 * display AND working window management (it resizes its window via CDP).
 * Stock runners export DISPLAY via Xvfb yet headful init still fails
 * upstream (`[object ErrorEvent]`), so the only honest gate is to exercise
 * the contract itself: launch headful, open a page, resize the window, and
 * confirm the viewport grew. macOS/Windows carry a real display and reuse
 * the file probe rather than spawning a GUI chrome (the #8445 hazard).
 */
async function headfulCanLaunch(): Promise<boolean> {
	if (!(await chromiumCanLaunch())) return false;
	if (process.platform !== "linux") return true;
	if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
	const { acquireBrowser, releaseBrowser } = await import("@oh-my-pi/pi-coding-agent/tools/browser/registry");
	let browser: BrowserHandle | undefined;
	try {
		browser = await acquireBrowser({ kind: "headless", headless: false }, { cwd: process.cwd() });
		if (!("browser" in browser)) return false;
		const page = await browser.browser.newPage();
		await page.goto("about:blank");
		const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
		const client = await page.createCDPSession();
		const { windowId } = await client.send("Browser.getWindowForTarget");
		await client.send("Browser.setWindowBounds", { windowId, bounds: { width: 1400, height: 900 } } as never);
		const after = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
		return after.width > before.width + 50 && after.height > before.height + 50;
	} catch {
		return false;
	} finally {
		if (browser && "browser" in browser && browser.browser.connected) {
			await releaseBrowser(browser, { kill: true });
		}
	}
}

let headfulProbe: Promise<boolean> | undefined;

/** Gate for tests that launch a visible (headful) Chromium window. */
export function headfulChromiumAvailable(): Promise<boolean> {
	headfulProbe ??= headfulCanLaunch();
	return headfulProbe;
}
