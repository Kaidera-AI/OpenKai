/**
 * .env autoload — dependency-free, CLI-bootstrap only.
 *
 * Loads `<cwd>/.env` first, then `~/.openkai/.env` as a user-global
 * fallback (so provider keys work outside the project checkout). Real
 * environment variables always win over file values; the project file wins
 * over the global one (first set wins, so the project file loads first).
 * Supports comments (#), blank lines, optional `export ` prefix, and
 * single/double-quoted values.
 *
 * Trust boundary: the project file rides along with a checkout, so it may
 * set ONLY credential-shaped provider keys — names matching
 * /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)$/i outside the harness's
 * own configuration namespaces. Everything else (OPENKAI_*, CORTEX_*, and
 * any non-credential name) is IGNORED there: behavioural knobs such as
 * OPENKAI_RELEASE_PUBLIC_KEY, OPENKAI_HUB_TOKEN, or OPENKAI_MANIFEST_URL
 * must come from the operator's own global file or the real environment,
 * both of which may set anything.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { openkaiHome } from "@kaidera/openkai-core";

/** Names a project-local .env may set: credential-shaped provider keys. */
const PROJECT_KEY_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)$/i;

/**
 * The harness's own configuration namespaces. These names are behavioural
 * knobs, not provider credentials, and must never come from a checked-out
 * project file even when they happen to end in a credential suffix
 * (OPENKAI_RELEASE_PUBLIC_KEY, OPENKAI_HUB_TOKEN, …).
 */
const HARNESS_NAMESPACE_PATTERN = /^(OPENKAI|CORTEX)_/i;

function loadFile(file: string, credentialKeysOnly: boolean): void {
  if (!existsSync(file)) return;

  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return; // unreadable .env must not kill the CLI
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const equals = body.indexOf("=");
    if (equals <= 0) continue;
    const key = body.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (
      credentialKeysOnly &&
      (!PROJECT_KEY_PATTERN.test(key) || HARNESS_NAMESPACE_PATTERN.test(key))
    ) {
      continue;
    }
    let value = body.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (value.includes(" ")) {
      // Unquoted values: strip trailing ` # comment` text and pasted labels
      // (keys never contain spaces; the first token is the value).
      value = value.split(/\s+/)[0] ?? "";
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadDotEnv(cwd: string = process.cwd()): void {
  // Project file first: only credential-shaped provider keys are honoured,
  // and the first set wins, so these beat the global file below.
  //
  // Embedded deployments (the KOS appliance, consult 62e9a90e) set
  // OPENKAI_IGNORE_PROJECT_ENV so <OPENKAI_HOME>/.env is the SOLE credential
  // authority. Without it the write path is unified but the read path is not:
  // a checked-out repo's .env silently outranks the key the Settings UI
  // wrote, so the UI displays one credential while the harness bills another.
  // Any value enables it — the fail-safe direction is "store wins" — and the
  // knob cannot be disabled by the file it guards (HARNESS_NAMESPACE_PATTERN
  // blocks OPENKAI_* from a project .env).
  if (!process.env.OPENKAI_IGNORE_PROJECT_ENV) {
    loadFile(path.join(cwd, ".env"), true);
  }
  loadFile(path.join(openkaiHome(), ".env"), false);
}
