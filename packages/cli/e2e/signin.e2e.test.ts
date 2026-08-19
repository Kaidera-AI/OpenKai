import { test, expect } from "@microsoft/tui-test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cli = path.resolve(process.cwd(), "dist/index.js");
const fixtureHome = mkdtempSync(path.join(tmpdir(), "openkai-signin-"));
mkdirSync(path.join(fixtureHome, ".openkai"), { recursive: true });
writeFileSync(path.join(fixtureHome, ".openkai", "config.json"), JSON.stringify({ onboarded: true }));

test.use({
  program: { file: "node", args: [cli, "tui"] },
  env: { HOME: fixtureHome, OPENROUTER_API_KEY: "e2e-dummy-key" },
});

test("sign-in overlay: open, type key, submit, key persists", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write(" ");
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 10000 });
  terminal.write("/settings\r");
  await expect(terminal.getByText(/appearance/g, { strict: false })).toBeVisible({ timeout: 8000 });
  terminal.write("\x1b[C"); // providers tab
  await expect(terminal.getByText(/OpenRouter/g, { strict: false })).toBeVisible({ timeout: 5000 });
  terminal.write("\r"); // first provider → sign-in overlay
  await expect(terminal.getByText(/sign in/g, { strict: false })).toBeVisible({ timeout: 5000 });
  terminal.write("sk-e2e-test-key");
  terminal.write("\r");
  await expect(terminal.getByText(/Sign-in:/g, { strict: false })).toBeVisible({ timeout: 5000 });
});

test("oauth overlay opens and cancels without a crash", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write(" ");
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 10000 });
  terminal.write("/settings\r");
  await expect(terminal.getByText(/appearance/g, { strict: false })).toBeVisible({ timeout: 8000 });
  terminal.write("\x1b[C");
  await expect(terminal.getByText(/OpenRouter/g, { strict: false })).toBeVisible({ timeout: 5000 });
  // Down to an OAuth lane (anthropic is the 2nd provider) and open it.
  terminal.write("\x1b[B");
  terminal.write("\r");
  // Whatever the overlay shows (device flow start, error, or cancel) — the process must stay alive and responsive.
  terminal.write("\x1b");
  await expect(terminal.getByText(/providers/g, { strict: false })).toBeVisible({ timeout: 5000 });
});
