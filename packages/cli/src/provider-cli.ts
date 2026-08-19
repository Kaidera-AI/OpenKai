/**
 * `openkai provider` — the CLI surface of the provider-config write path
 * (KOS consult 62e9a90e Q1). One command, one code path: the TUI, this CLI,
 * and KOS's Settings UI all mutate credentials through provider-config.ts.
 *
 *   openkai provider list            — every lane + its key status
 *   openkai provider set <id> --key <value>   — write the lane's key (0600 store)
 *   openkai provider unset <id>      — remove the lane's key
 *
 * Non-interactive by design (uid-10001/container use): set/unset take their
 * values from flags, never prompts.
 */

import { PROVIDERS, providerKeyStatus } from "./providers.js";
import {
  PROVIDER_ALIASES,
  resolveProviderId,
  setProviderKey,
  unsetProviderKey,
} from "./provider-config.js";

export interface ProviderCliOptions {
  sub?: string;
  args: string[];
  key?: string;
}

export function runProvider(options: ProviderCliOptions): number {
  const sub = options.sub ?? "list";

  if (sub === "list") {
    const lines = Object.entries(PROVIDERS).map(([id, info]) => {
      const status = providerKeyStatus(id);
      const state = info.keyless === true
        ? "keyless (local server)"
        : status.configured && status.via
          ? `✓ via ${status.via}`
          : status.oauth === true
            ? "OAuth lane"
            : "—";
      return `${id.padEnd(20)} ${state}`;
    });
    const aliases = Object.entries(PROVIDER_ALIASES).map(([alias, id]) => `${alias} → ${id}`);
    process.stdout.write(`${lines.join("\n")}\n${aliases.length > 0 ? `\naliases: ${aliases.join(" · ")}\n` : ""}`);
    return 0;
  }

  const id = options.args[0];
  if (!id) {
    process.stderr.write(`openkai provider ${sub} requires a provider id (e.g. openrouter, anthropic, ollama-cloud)\n`);
    return 2;
  }
  const resolved = resolveProviderId(id);
  if (!PROVIDERS[resolved]) {
    process.stderr.write(`unknown provider: ${id}\n`);
    return 2;
  }

  if (sub === "set") {
    if (!options.key) {
      process.stderr.write(`openkai provider set requires --key <value>\n`);
      return 2;
    }
    const key = options.key.trim();
    if (key === "") {
      process.stderr.write(`empty key — pass the credential value to --key\n`);
      return 2;
    }
    try {
      const envKey = setProviderKey(resolved, key);
      process.stdout.write(`${resolved}: ${envKey} written to the credential store (0600)\n`);
      return 0;
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  if (sub === "unset") {
    try {
      const envKey = unsetProviderKey(resolved);
      process.stdout.write(`${resolved}: ${envKey} removed\n`);
      // Sibling lanes share env vars (ollama-cloud → OLLAMA_API_KEY is the
      // proven collision). Warn when another known lane reads the same var.
      const siblings = Object.entries(PROVIDERS)
        .filter(([otherId, other]) => otherId !== resolved && other.envKeys.includes(envKey))
        .map(([otherId]) => otherId);
      if (siblings.length > 0) {
        process.stdout.write(`note: ${envKey} is shared with ${siblings.join(", ")} — their credential changed too\n`);
      }
      return 0;
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  process.stderr.write(`openkai provider — unknown subcommand "${sub}" (list | set | unset)\n`);
  return 2;
}
