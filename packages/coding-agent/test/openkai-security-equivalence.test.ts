/**
 * E022 Inc 05 gate — trust-surface equivalence: the 0.84 line's certified
 * security classes (security-repro-e002/e012/e019) re-proven against the
 * fork's seams. The original suites are bound to the retired
 * @kaidera/openkai-core architecture; this suite exercises the SAME classes
 * on the code that ships now:
 *
 *   E002-F1 — redactSecrets prefix coverage: provider shapes the product
 *             ships first-class (groq, cerebras, together, mistral, openrouter,
 *             OpenAI sk-) plus opaque known-value redaction.
 *   F4/F10  — deny floor: protected node + its CONTENTS + the node itself
 *             (.ssh) denied; ancestor-walk containment.
 *   F7-class — the redacting activity sink fires on every string field of a
 *             routing event (a provider error echoing a key is redacted at
 *             the sink boundary).
 *   procenv — spawned children never inherit credential-shaped env.
 *
 * CANARY FIXTURES ARE ASSEMBLED AT RUNTIME — never written as literals
 * (the 0.84 discipline; the source scanner must never see a fixture shape).
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { floorMatchFor, outsideCwd } from "../src/openkai/gate-floor";
import { createRedactingSink, type RoutingEvent } from "../src/openkai/shift/activity";
import { scrubbedChildEnv } from "../src/openkai/procenv";
import { redactSecrets, SECRET_PREFIXES } from "../src/openkai/secrets";

/** Assemble a canary token at runtime: prefix + filler. */
function canary(prefix: string, filler: string): string {
  return `${prefix}${filler}`;
}
const FILLER = "A1b2C3d4E5f6G7h8I9j0KLMNOPQRSTuvwx";

describe("E002-F1 class: provider prefix coverage on the fork seam", () => {
  test("every shipped provider prefix redacts in free text", () => {
    const cases: Array<[string, string]> = [
      ["sk-", "openai"], // anthropic/openai bare sk- (the E012 widening)
      ["gsk_", "groq"],
      ["csk-", "cerebras"],
      ["sk-or-", "openrouter"],
      ["sk-kimi", "moonshot"],
      ["xai-", "grok"],
    ];
    for (const [prefix, label] of cases) {
      const token = canary(prefix, FILLER);
      const redacted = redactSecrets(`provider ${label} error body: ${token}`);
      expect(redacted).not.toContain(token);
      expect(redacted).toContain("[redacted-secret]");
    }
  });

  test("the prefix list is exported and wide", () => {
    expect(SECRET_PREFIXES.length).toBeGreaterThanOrEqual(8);
    expect(SECRET_PREFIXES.some((p) => p.startsWith("gsk"))).toBe(true);
    expect(SECRET_PREFIXES.some((p) => p.startsWith("csk"))).toBe(true);
  });

  test("known-value redaction catches shapeless tokens", () => {
    // An opaque token with no recognised prefix — only the KNOWN-VALUE path
    // can catch it (the E002-F1 core finding).
    const opaque = "opq_9f8e7d6c5b4a3Z2y1X0wVUTSRQPONMLK";
    const env = { CORTEX_ADMIN_TOKEN: opaque } as NodeJS.ProcessEnv;
    const redacted = redactSecrets(`error: auth rejected ${opaque}`, env);
    expect(redacted).not.toContain(opaque);
  });

  test("PEM private-key headers redact; bodies redact via the known-value path", () => {
    // The ported semantics (identical to the certified 0.84 line): the PEM
    // header matches the secret-shape alternation; the base64 body is caught
    // by the known-value path when the key is in the process env.
    const pem = `-----BEGIN OPENSSH PRIVATE KEY-----\n${FILLER}${FILLER}\n-----END OPENSSH PRIVATE KEY-----`;
    const redacted = redactSecrets(`key material:\n${pem}`);
    expect(redacted).not.toContain("BEGIN OPENSSH PRIVATE KEY");
    const env = { DEPLOY_PRIVATE_KEY: `${FILLER}${FILLER}` } as NodeJS.ProcessEnv;
    const withKnown = redactSecrets(`key material:\n${pem}`, env);
    expect(withKnown).not.toContain(FILLER);
  });
});

describe("F4/F10 class: deny floor containment", () => {
  test("protected node, its contents, and the node itself are denied", () => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "ok-e022-floor-")));
    // The .env node and anything under it (the ancestor-walk: a directory
    // component named .env must not escape via .env/production).
    expect(floorMatchFor(cwd, ".env")).toBeDefined();
    expect(floorMatchFor(cwd, ".env/production")).toBeDefined();
    expect(floorMatchFor(cwd, "config/.env")).toBeDefined();
    // F10: the .ssh node itself, not just its contents.
    expect(floorMatchFor(cwd, ".ssh")).toBeDefined();
    expect(floorMatchFor(cwd, ".ssh/id_ed25519")).toBeDefined();
    // Clean paths pass.
    expect(floorMatchFor(cwd, "src/app.ts")).toBeUndefined();
    expect(floorMatchFor(cwd, "README.md")).toBeUndefined();
  });

  test("outside-cwd containment catches traversal", () => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "ok-e022-cwd-")));
    expect(outsideCwd(cwd, "../escape.txt")).toBe(true);
    expect(outsideCwd(cwd, "inside/ok.ts")).toBe(false);
    // Absolute path outside the folder.
    expect(outsideCwd(cwd, "/etc/passwd")).toBe(true);
  });
});

describe("F7 class: the routing-event redacting sink", () => {
  test("a provider error echoing a key is redacted at the sink boundary", () => {
    const seen: RoutingEvent[] = [];
    const sink = createRedactingSink((event) => seen.push(event));
    const leakedToken = canary("sk-or-", FILLER);
    sink({
      kind: "routing_error",
      stage: "build",
      reason: `provider 401: invalid api key ${leakedToken}`,
    });
    expect(seen.length).toBe(1);
    expect(seen[0]!.reason).not.toContain(leakedToken);
    expect(seen[0]!.reason).toContain("[redacted-secret]");
  });

  test("clean events pass through untouched", () => {
    const seen: RoutingEvent[] = [];
    const sink = createRedactingSink((event) => seen.push(event));
    sink({ kind: "routing", stage: "build", model: "openrouter/free-model", reason: "tier flip on severity" });
    expect(seen[0]!.model).toBe("openrouter/free-model");
    expect(seen[0]!.reason).toBe("tier flip on severity");
  });
});

describe("procenv class: children never inherit credentials", () => {
  test("credential-shaped env is scrubbed from child processes", () => {
    const prev = { ...process.env };
    process.env.OPENAI_API_KEY = canary("sk-", FILLER);
    process.env.CORTEX_ADMIN_TOKEN = "opq_secret_value_1234567890";
    process.env.PLAIN_SETTING = "safe-value";
    try {
      const env = scrubbedChildEnv();
      expect(env.OPENAI_API_KEY).toBeUndefined();
      expect(env.CORTEX_ADMIN_TOKEN).toBeUndefined();
      expect(env.PLAIN_SETTING).toBe("safe-value");
      expect(env.CI).toBe("1");
    } finally {
      process.env = prev;
    }
  });

  test("an operator-explicit override wins over the scrub", () => {
    const env = scrubbedChildEnv({ MY_SAFE_FLAG: "on" });
    expect(env.MY_SAFE_FLAG).toBe("on");
  });
});
