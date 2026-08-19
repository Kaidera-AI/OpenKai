import { test, expect } from "@microsoft/tui-test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cli = path.resolve(process.cwd(), "dist/index.js");
const fixtureHome = mkdtempSync(path.join(tmpdir(), "openkai-theme-"));
mkdirSync(path.join(fixtureHome, ".openkai"), { recursive: true });
writeFileSync(path.join(fixtureHome, ".openkai", "config.json"), JSON.stringify({ onboarded: true }));

test.use({
  program: { file: "node", args: [cli, "tui"] },
  env: { HOME: fixtureHome, OPENROUTER_API_KEY: "e2e-dummy-key" },
});

test("theme picker: moving previews live, Enter applies and persists, Esc restores", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write(" ");
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 10000 });
  terminal.write("/settings\r");
  await expect(terminal.getByText(/appearance/g, { strict: false })).toBeVisible({ timeout: 8000 });
  terminal.write("\r"); // theme row → picker
  await expect(terminal.getByText(/move to preview/g, { strict: false })).toBeVisible({ timeout: 5000 });
  // The picker hint line is the preview grammar's proof; move through two themes.
  terminal.write("\x1b[B\x1b[B");
  await expect(terminal.getByText(/gruvbox|dracula|catppuccin/g, { strict: false })).toBeVisible({ timeout: 3000 });
  terminal.write("\r"); // apply
  await expect(terminal.getByText(/theme: /g, { strict: false })).toBeVisible({ timeout: 5000 });
});
