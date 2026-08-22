/**
 * Provider-config write path (KOS consult 62e9a90e, Q1) — the ONE code path
 * that edits the credential store. The TUI sign-in overlay, the
 * `openkai provider` CLI, and KOS's Settings UI all call this; nobody
 * hand-edits `~/.openkai/.env` again. The CTO's requirement ("if we
 * configure it in the TUI or in the app it is the same thing") is true by
 * construction here, not by convention.
 *
 * Store: `<OPENKAI_HOME>/.env` (env-var format, `<PROVIDER>_API_KEY`
 * canonical per providers.ts, mode 0600). Comments and line ordering are
 * preserved; writes are atomic (tmp + rename); pre-existing loose files are
 * repaired to 0600 on every write.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openkaiHome } from "./config.js";
import { PROVIDERS } from "./providers.js";

/** The credential store path. */
export function providerEnvPath(): string {
  return path.join(openkaiHome(), ".env");
}

/** Parse the store, preserving comments and ordering. */
export function readProviderKeys(): Record<string, string> {
  const file = providerEnvPath();
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(file, "utf-8").split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const equals = body.indexOf("=");
    if (equals <= 0) continue;
    const key = body.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Atomic rewrite of the store with one entry applied (set or removed). */
function applyEnvEdit(key: string, value: string | undefined): void {
  const file = providerEnvPath();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lines = existsSync(file) ? readFileSync(file, "utf-8").split("\n") : [];
  const matches = (l: string): boolean => {
    const t = l.trim();
    return t.startsWith(`${key}=`) || t.startsWith(`export ${key}=`);
  };
  const index = lines.findIndex(matches);
  // EVERY occurrence goes, not just the first: the two readers of this store
  // disagree on duplicates (env.ts takes the first, readProviderKeys the
  // last), so a stale leftover line makes the Settings UI display one
  // credential while the harness uses another. A migration that appends
  // (KOS's app_settings one-way import) is exactly how duplicates arrive.
  const kept = lines.filter((l) => !matches(l));
  if (value !== undefined) {
    const entry = `${key}=${value}`;
    // Splice at the original index to hold position — every line before the
    // first match is a non-match, so indices agree up to that point.
    if (index >= 0) kept.splice(index, 0, entry);
    else kept.push(entry);
  }
  const body = kept.filter((l) => l.trim().length > 0).join("\n") + "\n";
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, body, { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600); // repair pre-existing loose files on every write
}

/**
 * Write (or replace) one KEY=VALUE entry and sync the live environment.
 * The single mutation entry point for every surface. Values are single-line
 * by contract — a newline would inject arbitrary lines into the store
 * (including harness knobs the project-.env trust boundary exists to block).
 */
export function writeProviderKey(key: string, value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`invalid env key name: ${JSON.stringify(key)}`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("key values must be single-line (no newlines)");
  }
  // Values with whitespace or '#' are quoted on write — both readers (this
  // module and env.ts's loader) round-trip quoted values; unquoted they
  // skew on next boot (truncated at the first space). Quote-wrapped inputs
  // and quote+whitespace mixes don't round-trip either (AdvChannels I1) —
  // reject them rather than store a value that reads back differently.
  if (/^["']|["']$/.test(value)) {
    throw new Error("key values must not start or end with a quote character (store the raw credential)");
  }
  if (/[\s#]/.test(value) && value.includes('"')) {
    throw new Error("key values with both whitespace and double quotes are not storable — strip one");
  }
  const stored = /[\s#]/.test(value) ? `"${value}"` : value;
  applyEnvEdit(key, stored);
  process.env[key] = value;
}

/** Remove one KEY=VALUE entry and unset it in the live environment. */
export function removeProviderKey(key: string): void {
  applyEnvEdit(key, undefined);
  delete process.env[key];
}

/** The canonical env var for a provider id (envKeys[0]; undefined for keyless/OAuth-only lanes). */
export function canonicalEnvKey(providerId: string): string | undefined {
  const id = resolveProviderId(providerId);
  const info = PROVIDERS[id];
  if (info?.envKeys[0] !== undefined) return info.envKeys[0];
  // Keyless (ollama) and OAuth-only lanes take NO env key — never fabricate
  // one (the <ID>_API_KEY for a keyless lane would be another lane's real
  // credential: ollama → OLLAMA_API_KEY = ollama-cloud's key. Proven in
  // review).
  if (info !== undefined) return undefined;
  // Unknown-to-the-registry providers follow the <PROVIDER>_API_KEY convention.
  return `${id.replace(/-/g, "_").toUpperCase()}_API_KEY`;
}

/**
 * KOS↔OpenKai vocabulary aliases (consult 62e9a90e Q4). Our registry is the
 * sole provider vocabulary; these map KOS's app_settings ids onto it.
 * `dashscope`/`alibaba_cloud` have no direct pi-ai lane today — they resolve
 * through OpenRouter (documented, not aliased to a wrong lane).
 */
export const PROVIDER_ALIASES: Record<string, string> = {
  ollama_cloud: "ollama-cloud",
  moonshot: "moonshotai",
};

/** Resolve an id through the alias map (ids already in the registry pass through). */
export function resolveProviderId(id: string): string {
  if (PROVIDERS[id] !== undefined) return id;
  return PROVIDER_ALIASES[id] ?? id;
}

/** Set a provider's key (the provider-scoped write). Returns the env var written. */
export function setProviderKey(providerId: string, key: string): string {
  const envKey = canonicalEnvKey(providerId);
  if (!envKey) throw new Error(`provider ${providerId} takes no env key (keyless or OAuth-only lane)`);
  // Multi-key lanes cannot be configured by a single value: this writes only
  // envKeys[0], but providerKeyStatus needs ALL of them, so the lane would read
  // back unconfigured while we reported success — a Settings UI renders a green
  // check over a dead lane. Refuse, name every variable, and write NOTHING
  // rather than leave the store half-configured.
  const info = PROVIDERS[resolveProviderId(providerId)];
  if (info?.requiresAllKeys === true && info.envKeys.length > 1) {
    throw new Error(
      `provider ${providerId} needs all of ${info.envKeys.join(", ")} — ` +
        `set each one with writeProviderKey(<VAR>, <value>); a single --key would ` +
        `store ${envKey} only and leave the lane unconfigured`,
    );
  }
  writeProviderKey(envKey, key);
  return envKey;
}

/** Remove a provider's key. Returns the env var removed. */
export function unsetProviderKey(providerId: string): string {
  const envKey = canonicalEnvKey(providerId);
  if (!envKey) throw new Error(`provider ${providerId} takes no env key (keyless or OAuth-only lane)`);
  removeProviderKey(envKey);
  return envKey;
}
