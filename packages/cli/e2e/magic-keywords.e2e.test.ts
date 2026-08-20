import { test, expect } from "@microsoft/tui-test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cli = path.resolve(process.cwd(), "dist/index.js");
const fixtureHome = mkdtempSync(path.join(tmpdir(), "openkai-mk-e2e-"));
mkdirSync(path.join(fixtureHome, ".openkai"), { recursive: true });
writeFileSync(path.join(fixtureHome, ".openkai", "config.json"), JSON.stringify({ onboarded: true }));

test.use({
  program: { file: "node", args: [cli, "tui"] },
  env: { HOME: fixtureHome, OPENROUTER_API_KEY: "e2e-dummy-key" },
});

// E017 UK round 4: magic keywords render in the composer and the settings
// row toggles them. (The shimmer's SGR painting is pinned at render level in
// composer-shimmer.test.ts — xterm's text buffer carries no raw escapes.)
test("ultrathink renders in the composer; settings row toggles the keywords", async ({ terminal }) => {
  await expect(terminal.getByText(/Kaidera/g, { strict: false })).toBeVisible({ timeout: 15000 });
  terminal.write(" ");
  await expect(terminal.getByText(/idle|local/g, { strict: false })).toBeVisible({ timeout: 10000 });

  // Type the keyword — it renders in the composer.
  terminal.write("ultrathink");
  await expect(terminal.getByText(/ultrathink/g, { strict: false })).toBeVisible({ timeout: 3000 });

  // Settings → interaction tab (→ switches tabs) shows the toggle row (clear
  // the draft first — backspace deletes one grapheme per \x7f).
  terminal.write("\x7f".repeat(10));
  terminal.write("/settings\r");
  await expect(terminal.getByText(/appearance/g, { strict: false })).toBeVisible({ timeout: 8000 });
  terminal.write("\x1b[C\x1b[C\x1b[C"); // appearance → providers → model → interaction
  await expect(terminal.getByText(/magic keywords/g, { strict: false })).toBeVisible({ timeout: 5000 });
});
