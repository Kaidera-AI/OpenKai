import { test, expect } from "@microsoft/tui-test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cli = path.resolve(process.cwd(), "dist/index.js");
const fixtureHome = mkdtempSync(path.join(tmpdir(), "openkai-cov-"));
mkdirSync(path.join(fixtureHome, ".openkai"), { recursive: true });
writeFileSync(path.join(fixtureHome, ".openkai", "config.json"), JSON.stringify({ onboarded: true }));

test.use({
  program: { file: "node", args: [cli, "tui"] },
  env: { HOME: fixtureHome, OPENROUTER_API_KEY: "e2e-dummy-key" },
});

// Drive the full providers configuration surface looking for the crash.
test("providers configuration surface: settings tab, rows, sign-in overlay", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write(" ");
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 10000 });
  terminal.write("/settings\r");
  await expect(terminal.getByText(/appearance/g, { strict: false })).toBeVisible({ timeout: 8000 });
  terminal.write("\x1b[C"); // providers tab
  await expect(terminal.getByText(/OpenRouter/g, { strict: false })).toBeVisible({ timeout: 5000 });
  // Enter on the first provider row → sign-in overlay opens
  terminal.write("\r");
  await expect(terminal.getByText(/sign in/g, { strict: false })).toBeVisible({ timeout: 5000 });
  terminal.write("\x1b"); // cancel
  // Navigate several rows and Enter (keyless lane notice path)
  terminal.write("\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B\x1b[B");
  terminal.write("\r");
  terminal.write("\x1b");
  await expect(terminal.getByText(/providers/g, { strict: false })).toBeVisible({ timeout: 5000 });
});

test("fuse configure flow shows provider/model steps, never theme", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write(" ");
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 10000 });
  terminal.write("/fuse\r");
  await expect(terminal.getByText(/configure fusion models/g, { strict: false })).toBeVisible({ timeout: 8000 });
  terminal.write("\r"); // "configure fusion models" is the first entry
  await expect(terminal.getByText(/fusion model 1/g, { strict: false })).toBeVisible({ timeout: 5000 });
  // Content check: providers visible, and no theme pack names leak into the fusion flow.
  await expect(terminal.getByText(/OpenRouter|Anthropic/g, { strict: false })).toBeVisible({ timeout: 5000 });
  await expect(terminal.getByText(/catppuccin|tokyonight/g, { strict: false })).not.toBeVisible({ timeout: 1500 });
});
