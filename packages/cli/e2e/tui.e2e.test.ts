/**
 * E2E smoke — drives the REAL compiled CLI in a pty (Factory/MIT tui-test).
 * Complements the headless component tests: this proves the shipped binary
 * boots the alt-screen TUI and the palette opens, end to end.
 *
 * Runs separately from `npm test` (`npm run test:e2e`) — pty tests are for
 * dev machines, not the CI gate.
 */

import { test, expect } from "@microsoft/tui-test";
import path from "node:path";

// tui-test transpiles+caches this file under .tui-test/cache/, so anchor the
// CLI path to the runner's cwd (packages/cli), never to this file's location.
const cli = path.resolve(process.cwd(), "dist/index.js");

// A dummy key: the TUI boots and renders without any network call (the
// transport resolves the model from the offline bundled catalogue; the
// first request only happens on submit, which this test never does).
test.use({
  program: { file: "node", args: [cli, "tui"] },
  env: { OPENROUTER_API_KEY: "e2e-dummy-key" },
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
