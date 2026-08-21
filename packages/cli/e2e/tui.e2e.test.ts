/**
 * E2E smoke — drives the REAL compiled CLI in a pty (Factory/MIT tui-test).
 * Complements the headless component tests: this proves the shipped binary
 * boots the alt-screen TUI and the palette opens, end to end.
 *
 * Runs separately from `npm test` (`npm run test:e2e`) — pty tests are for
 * dev machines, not the CI gate.
 */

import { test, expect } from "@microsoft/tui-test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// tui-test transpiles+caches this file under .tui-test/cache/, so anchor the
// CLI path to the runner's cwd (packages/cli), never to this file's location.
const cli = path.resolve(process.cwd(), "dist/index.js");

// Onboarded fixture HOME: without it the first-run welcome (readline prompts)
// blocks the pty forever and every boot assertion times out.
const fixtureHome = mkdtempSync(path.join(tmpdir(), "openkai-e2e-home-"));
mkdirSync(path.join(fixtureHome, ".openkai"), { recursive: true });
writeFileSync(path.join(fixtureHome, ".openkai", "config.json"), JSON.stringify({ onboarded: true }));

// A dummy key: the TUI boots and renders without any network call (the
// transport resolves the model from the offline bundled catalogue; the
// first request only happens on submit, which this test never does).
test.use({
  program: { file: "node", args: [cli, "tui"] },
  env: { HOME: fixtureHome, OPENROUTER_API_KEY: "e2e-dummy-key" },
});

test("TUI boots: brand mark + composer + status chrome render", async ({ terminal }) => {
  // Fresh HOME shows the block-logo splash ("by Kaidera · <version>"); a
  // seen-splash HOME shows the compact mark ("OpenKai <v> · by Kaidera —").
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible();
});

test("Ctrl+K opens the command palette with the canonical footer", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write("\x0B"); // Ctrl+K
  await expect(terminal.getByText(/Navigate/g, { strict: false })).toBeVisible({ timeout: 5000 });
});

// E017 UX: themes live in /settings as a VISIBLE list (no blind cycling).
// Drives the real binary: skip splash → /settings → Enter on the theme row →
// the picker lists the themes. Regression guard for the 2026-08-19 report.
// Waits are condition-driven (toBeVisible polls); no wall-clock sleeps.
test("settings appearance tab: theme row opens the theme picker list", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write(" "); // skip the splash animation
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 10000 });
  terminal.write("/settings\r"); // autocomplete submits the command on Enter
  await expect(terminal.getByText(/appearance/g, { strict: false })).toBeVisible({ timeout: 8000 });
  terminal.write("\r"); // Enter on the theme row → picker
  await expect(terminal.getByText(/catppuccin/g, { strict: false })).toBeVisible({ timeout: 5000 });
  await expect(terminal.getByText(/tokyonight/g, { strict: false })).toBeVisible();
});

test("Wave 0 PTY viewport matrix keeps draft and status visible without clipping", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write(" "); // skip any remaining brand animation
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 10000 });
  terminal.write("wave0-draft");

  const viewports = [
    [40, 12],
    [60, 18],
    [80, 24],
    [120, 30],
    [160, 40],
    [200, 60],
  ] as const;
  for (const [columns, rows] of viewports) {
    terminal.resize(columns, rows);
    await expect(terminal.getByText(/wave0-draft/g, { strict: false })).toBeVisible({ timeout: 5000 });
    await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 5000 });
    const frame = terminal.getViewableBuffer();
    assert.equal(frame.length, rows, `${columns}x${rows} PTY retains the requested viewport height`);
    assert.ok(frame.every((line) => line.length === columns), `${columns}x${rows} PTY rows stay within the viewport`);
  }
});
