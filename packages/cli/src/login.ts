/**
 * openkai login — subscription OAuth flows (Codex, Copilot, Anthropic OAuth).
 * Drives the provider's pi-ai OAuth implementation with the normalized
 * AuthInteraction contract (prompt/notify/signal), persists the credential
 * into the core's persistent credential store (`defaultModels()`), and
 * confirms with a catalogue refresh.
 *
 * The flow is device-code shaped: we print + open the verification URL and
 * read the user code back — no local server, works over SSH.
 */

import { execFile } from "node:child_process";
import readline from "node:readline";

import { defaultModels } from "@kaidera/openkai-core";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";

/** Open a URL in the system browser (best-effort, never fatal). */
function openBrowser(url: string): void {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  execFile(opener, [url], () => undefined);
}

export interface LoginOptions {
  provider: string;
}

export async function runLogin(options: LoginOptions): Promise<number> {
  // defaultModels() is the persistent credential store — OAuth tokens
  // survive restart, unlike a bare builtinModels() instance.
  const models = defaultModels();
  const provider = models.getProvider(options.provider);
  if (!provider) {
    process.stderr.write(`unknown provider "${options.provider}"\n`);
    return 2;
  }
  const oauth = provider.auth.oauth;
  if (!oauth) {
    process.stderr.write(
      `provider "${options.provider}" has no OAuth subscription lane. ` +
        `OAuth lanes: openai-codex, github-copilot, anthropic (OAuth tokens).\n`,
    );
    return 2;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
  const abort = new AbortController();

  const interaction = {
    signal: abort.signal,
    async prompt(prompt: AuthPrompt): Promise<string> {
      if (prompt.type === "text" || prompt.type === "secret" || prompt.type === "manual_code") {
        const mask = prompt.type === "secret" ? " (hidden)" : "";
        return ask(`${prompt.message}${mask}${prompt.placeholder ? ` (${prompt.placeholder})` : ""}: `);
      }
      if (prompt.type === "select") {
        process.stdout.write(`${prompt.message}\n`);
        prompt.options.forEach((o, i) => process.stdout.write(`  ${i + 1}. ${o.label}\n`));
        const choice = await ask(`choice [1-${prompt.options.length}]: `);
        const index = Math.max(0, Math.min(prompt.options.length - 1, Number(choice || "1") - 1));
        return prompt.options[index]!.id;
      }
      return ask("input: ");
    },
    notify(event: AuthEvent): void {
      if (event.type === "device_code") {
        process.stdout.write(
          `\n  Open: ${event.verificationUri}\n  Code: ${event.userCode}\n\n`,
        );
        openBrowser(event.verificationUri);
        return;
      }
      if (event.type === "progress") {
        process.stdout.write(`  … ${event.message}\n`);
      }
    },
  };

  try {
    process.stdout.write(`openkai login — ${oauth.name}\n`);
    // models.login runs the provider flow AND persists the credential (the pi
    // pattern — the store is owned by the Models collection).
    await models.login(options.provider, "oauth", interaction as never);
    rl.close();

    // Confirm with a catalogue read (auth resolution runs through the store).
    const count = models.getModels(options.provider).length;
    process.stdout.write(
      `✓ ${oauth.name} authenticated — credential stored (${count} models in the catalogue).\n`,
    );
    return 0;
  } catch (error) {
    rl.close();
    process.stderr.write(
      `login failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
