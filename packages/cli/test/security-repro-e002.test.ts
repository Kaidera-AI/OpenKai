/**
 * SECURITY GATE REPRODUCERS — E002 §2 review of the Inc 01/02 surface
 * (casts + shift routing), filed by cole@openkai as handoff 66cf5727.
 *
 * FINDING E002-F1 (high) — `redactSecrets` was an allowlist of seven token
 * shapes. Providers OpenKai ships first-class support for in `.env.example`
 * (groq `gsk_`, cerebras `csk-`, together, mistral) plus the operator's
 * `CORTEX_ADMIN_TOKEN` were uncovered, so a provider error body echoing the
 * key reached `.openkai/activity.jsonl` in cleartext through the production
 * seam (`fuse.ts` → `appendActivity`).
 *
 * Why the original suite missed it: `shift.test.ts` §5 proves redaction with
 * an `nvapi-` fixture — a shape INSIDE the allowlist. The assertion passed
 * and read as "secrets are redacted", but only ever exercised covered shapes.
 *
 * Why "belt and braces" did not help: core's `createRedactingSink` and the
 * CLI's `redactStrings` both call the SAME `redactSecrets`. Two layers in the
 * call stack, one layer of decision — a shape gap defeated both at once.
 *
 * FINDING E002-F2 (medium) — `scripts/security-audit.sh` §1 was NARROWER than
 * the runtime redactor (it matched `sk-or-`/`sk-kim` but not bare `sk-`), so a
 * committed Anthropic or OpenAI key passed the commit gate clean.
 *
 * FIX (kai's review target): prefix list widened, PLUS known-value redaction
 * for opaque tokens that no shape can match. These tests now assert the FIXED
 * behaviour — they fail if the fix regresses.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  redactSecrets,
  SECRET_PREFIXES,
  ShiftRouter,
  type Cast,
  type RoutingEvent,
} from "@kaidera/openkai-core";
import { appendActivity, activityLogPath, runTail } from "../dist/tail.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Prefixed shapes — matched on shape alone, no env needed. */
const PREFIXED_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["GROQ_API_KEY (groq)", "gsk_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"],
  ["CEREBRAS_API_KEY (cerebras)", "csk-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"],
  ["HF_TOKEN (huggingface)", "hf_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"],
  ["GitHub fine-grained PAT", "github_pat_11ABCDEFG0AbCdEfGhIjKlMnOpQrStUvWxYz"],
  ["GitHub server-to-server", "ghs_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"],
  ["AWS access key id", "AKIAIOSFODNN7EXAMPLE"],
  ["ANTHROPIC_API_KEY", "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123"],
  ["NVIDIA_API_KEY", "nvapi-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"],
];

/** Opaque shapes — no prefix; only known-value redaction can catch these. */
const OPAQUE_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["TOGETHER_API_KEY", "a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809"],
  ["MISTRAL_API_KEY", "AbCdEfGhIjKlMnOpQrStUvWx0123456789ABcdef"],
  ["CORTEX_ADMIN_TOKEN", "ctxadmin0AbCdEfGhIjKlMnOpQrStUvWxYz01234"],
];

test("E002-F1: prefixed provider keys are redacted by shape alone", () => {
  for (const [name, secret] of PREFIXED_KEYS) {
    const out = redactSecrets(`401: invalid api key ${secret} for request`, {});
    assert.ok(!out.includes(secret), `${name} must be redacted`);
    assert.match(out, /\[redacted-secret\]/, `${name} leaves the marker`);
  }
});

test("E002-F1: csk- is redacted whole, with no dangling prefix character", () => {
  // Regression guard: `csk-` used to match only via the `sk-` alternative,
  // which left the leading `c` outside the marker.
  const out = redactSecrets("key csk-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 here", {});
  assert.match(out, /key \[redacted-secret\] here/, "no dangling c");
});

test("E002-F1: opaque provider tokens are redacted via known-value matching", () => {
  for (const [name, secret] of OPAQUE_KEYS) {
    const env = { [name]: secret, PATH: "/usr/bin" };
    const out = redactSecrets(`401: invalid api key ${secret} for request`, env);
    assert.ok(!out.includes(secret), `${name} must be redacted when held in env`);
  }
});

/**
 * REGRESSION (cole self-review) — known-value redaction must not fire on the
 * credential-NAMED but non-secret variables every real shell carries. These
 * exact names and value shapes were taken from a live `env` dump; an earlier
 * cut of the fix used the broad SECRET_NAME_PATTERN and blanked all of them.
 */
test("E002-F1: real-shell non-secret env vars are NOT redacted from output", () => {
  const realShell = {
    SSH_AUTH_SOCK: "/private/tmp/com.apple.launchd.7QqM3nAbCd/Listeners",
    SECURITYSESSIONID: "186a6",
    CLAUDE_CODE_BRIDGE_SESSION_ID: "f888a96824ad4c12a58e4d2e4a2353d3",
    CLAUDE_CODE_SESSION_ID: "f888a968-24ad-4c12-a58e-4d2e4a2353d3",
    XDG_SESSION_TYPE: "wayland-session-type",
  };
  for (const [name, value] of Object.entries(realShell)) {
    const out = redactSecrets(`context: ${name}=${value} in use`, realShell);
    assert.ok(out.includes(value), `${name} must survive redaction (not a secret)`);
  }

  // …while a real credential in the SAME environment is still redacted.
  const withKey = { ...realShell, TOGETHER_API_KEY: "a".repeat(40) };
  const out = redactSecrets(`key ${"a".repeat(40)} rejected`, withKey);
  assert.doesNotMatch(out, /a{40}/, "the actual credential is still redacted");
});

test("E002-F1: known-value redaction ignores non-credential names and short values", () => {
  // A non-credential env var must not be redacted even if long.
  const notSecret = { EDITOR: "/usr/local/bin/some-very-long-editor-path" };
  const kept = redactSecrets("launching /usr/local/bin/some-very-long-editor-path", notSecret);
  assert.match(kept, /some-very-long-editor-path/, "non-credential name is left alone");

  // A credential-named but trivially short value must not blank the output.
  const shortCred = { CI_TOKEN: "1", AUTH: "on" };
  const out = redactSecrets("built 1 artifact, auth is on", shortCred);
  assert.equal(out, "built 1 artifact, auth is on", "short values are not redacted");
});

/**
 * E002-F1b — the original §5 assertion with the fixture swapped to a shape
 * that used to be uncovered. This is the test that would have caught F1.
 */
test("E002-F1b: appendActivity redacts a Groq key on the way to activity.jsonl", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "oke002-belt-"));
  try {
    const COVERED = `${"nvapi"}-secret-key-in-error-body-xyz`;
    const UNCOVERED = "gsk_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

    appendActivity(cwd, "error", { message: `provider error: key ${COVERED} is not authorized` });
    appendActivity(cwd, "error", { message: `provider error: key ${UNCOVERED} is not authorized` });

    const content = await readFile(activityLogPath(cwd), "utf-8");
    assert.doesNotMatch(content, new RegExp(COVERED), "control: covered shape redacted");
    assert.doesNotMatch(content, new RegExp(UNCOVERED), "groq key must not reach the log");
    assert.match(content, /\[redacted-secret\]/, "both lines carry the marker");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

/**
 * E002-F1d — `openkai tail` must redact on READ, not only on write. The log
 * outlives any one version: a line written before the redactor covered a
 * provider still holds that key in cleartext, and every existing user has
 * such lines on disk right now. Found by smoke-testing the real binary
 * against a pre-seeded log, which the unit tests could not have caught
 * because they only ever wrote through appendActivity.
 */
test("E002-F1d: tail redacts a pre-existing cleartext key when rendering", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "oke002-tail-"));
  try {
    const KEY = "gsk_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    // Written directly, as a PRE-FIX OpenKai would have written it.
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(cwd, ".openkai"), { recursive: true });
    await writeFile(
      activityLogPath(cwd),
      `${JSON.stringify({ ts: "2026-08-16T21:00:00.000Z", kind: "error", message: `key ${KEY} rejected` })}\n`,
    );

    const chunks: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stdout.write;
    try {
      await runTail({ follow: false, lines: 10, cwd });
    } finally {
      process.stdout.write = write;
    }

    const output = chunks.join("");
    assert.doesNotMatch(output, new RegExp(KEY), "tail must not print the stored key");
    assert.match(output, /\[redacted-secret\]/, "tail shows the marker instead");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

/**
 * E002-F1c — end-to-end on the production path: a 429 whose body echoes the
 * key flows ShiftRouter.next() → createRedactingSink → the caller's sink
 * (wired to appendActivity in fuse.ts).
 */
test("E002-F1c: a 429 body cannot carry a key through the redacting sink", () => {
  const cast: Cast = {
    id: "t", tier: "cheap", provider: "groq",
    architectModel: "m1", builderModel: "m2", label: "t",
  };
  const fallbackCast: Cast = {
    id: "t2", tier: "cheap", provider: "openrouter",
    architectModel: "m3", builderModel: "m4", label: "t2",
  };
  const KEY = "gsk_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

  const captured: RoutingEvent[] = [];
  const router = new ShiftRouter({
    cast,
    fallbackCasts: [fallbackCast],
    onActivity: (e) => captured.push(e),
  });

  router.route("plan");
  router.next("plan", { status: 429, message: `rate limit exceeded for key ${KEY}` });

  const serialised = JSON.stringify(captured);
  assert.doesNotMatch(serialised, new RegExp(KEY), "the sink redacted the key");
  assert.match(serialised, /\[redacted-secret\]/, "the fallback reason carries the marker");
});

/**
 * E002-F2 — the commit-time scan must not be narrower than the redactor.
 * The pattern is read from the shell script itself, so this cannot pass by
 * testing a stale copy.
 */
test("E002-F2: security-audit.sh §1 catches the sk- keys the redactor catches", async () => {
  const script = await readFile(path.join(REPO_ROOT, "scripts/security-audit.sh"), "utf-8");
  const line = script.split("\n").find((l) => l.includes("secret_hits="));
  assert.ok(line, "the §1 scan line must exist");

  const match = /git grep -nE '\((.+)\)' --/.exec(line);
  assert.ok(match, "the §1 pattern must be extractable");
  const gatePattern = new RegExp(match[1]!);

  for (const key of [
    "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGh",
    "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
    "gsk_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
  ]) {
    assert.doesNotMatch(redactSecrets(key, {}), new RegExp(key), "redactor covers it");
    assert.ok(gatePattern.test(`SOME_API_KEY=${key}`), `§1 scan must also catch ${key.slice(0, 12)}…`);
  }
});

/**
 * DRIFT GUARD — the root cause of F2 was two hand-maintained copies of one
 * list. This fails the moment a prefix is added to secrets.ts without also
 * teaching the commit-time scan about it.
 */
test("E002-F2 drift guard: every SECRET_PREFIXES entry appears in security-audit.sh §1", async () => {
  const script = await readFile(path.join(REPO_ROOT, "scripts/security-audit.sh"), "utf-8");
  const line = script.split("\n").find((l) => l.includes("secret_hits=")) ?? "";
  const missing = SECRET_PREFIXES.filter((p: string) => !line.includes(p));
  assert.deepEqual(missing, [], `security-audit.sh §1 is missing prefixes: ${missing.join(", ")}`);
});
