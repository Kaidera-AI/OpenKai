/**
 * Child-process environment scrubbing (ren's adversarial review: MCP servers
 * and other spawned helpers must not inherit the operator's credentials).
 *
 * {@link scrubbedChildEnv} builds a copy of `process.env` with every variable
 * dropped whose NAME matches {@link SECRET_NAME_PATTERN} or whose VALUE matches
 * {@link SECRET_VALUE_PATTERN} — the same two patterns `secrets.ts` already
 * trusts for output redaction, so the scrub and the redactor can never drift
 * apart. `CI=1` is set so spawned tools pick their non-interactive behaviour.
 *
 * `extra` is applied LAST: an operator-explicit override (e.g. an MCP server's
 * `config.env` entry in ~/.openkai/mcp.json) always wins over the scrub — the
 * operator is the trust root, and an explicit config entry is a deliberate
 * hand-over, not a leak.
 */

import { SECRET_NAME_PATTERN, SECRET_VALUE_PATTERN } from "./secrets.js";

/**
 * Build a scrubbed copy of `process.env` for a spawned child process.
 * `extra` entries are applied last (an `undefined` value deletes the key).
 */
export function scrubbedChildEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SECRET_NAME_PATTERN.test(name)) continue;
    if (SECRET_VALUE_PATTERN.test(value)) continue;
    out[name] = value;
  }
  out.CI = "1";
  if (extra) {
    for (const [name, value] of Object.entries(extra)) {
      if (value === undefined) delete out[name];
      else out[name] = value;
    }
  }
  return out;
}
