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

import {
  readSessionMessages,
  redactSecrets,
  SECRET_PREFIXES,
  ShiftRouter,
  type Cast,
  type RoutingEvent,
} from "@kaidera/openkai-core";
import { appendActivity, activityLogPath, runTail } from "../dist/tail.js";
import { runSessions } from "../dist/sessions.js";
import { messageText } from "../dist/tui/app.js";
import { readSessionSearchRows } from "../dist/tui/session-search.js";

// Runner-independent: both `node --test` and tui-test run from packages/cli —
// import.meta.url breaks when the runner relocates compiled tests (tui-test
// caches them under .tui-test/). Anchor on cwd instead.
const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

/**
 * CANARY FIXTURES ARE ASSEMBLED AT RUNTIME — never written as literals.
 *
 * E002-F2b (found reviewing this file): `scripts/security-audit.sh` §1 greps
 * TRACKED SOURCE for exactly these shapes, and this suite's whole point is to
 * widen §1 until it covers them. A literal fixture here therefore turns the
 * commit gate RED against the suite that certifies it — which is precisely
 * what happened at ebc666e, where §1 reported 14 hits in this file while the
 * commit message recorded "audit PASSED" (it was measured while the file was
 * still untracked, and `git grep` skips untracked files).
 *
 * `k()` keeps the prefix and the body in separate string literals so the shape
 * never appears contiguously in source. Precedent: 3f89a45, which cole applied
 * to seven pre-existing fixtures in the sibling suites but not to this file.
 * The guard test at the bottom of this file enforces it from now on.
 */
const k = (...parts: readonly string[]): string => parts.join("");
const BODY = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

/** Prefixed shapes — matched on shape alone, no env needed. */
const PREFIXED_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["GROQ_API_KEY (groq)", k("gsk", "_", BODY)],
  ["CEREBRAS_API_KEY (cerebras)", k("csk", "-", BODY)],
  ["HF_TOKEN (huggingface)", k("hf", "_", BODY)],
  ["TOGETHER_API_KEY (together)", k("tgp", "_v1_", BODY)],
  ["GitHub fine-grained PAT", k("github", "_pat_11ABCDEFG0", BODY)],
  ["GitHub server-to-server", k("ghs", "_", BODY)],
  ["AWS access key id", k("AKIA", "IOSFODNN7EXAMPLE")],
  ["ANTHROPIC_API_KEY", k("sk", "-ant-api03-", BODY)],
  ["NVIDIA_API_KEY", k("nvapi", "-", BODY)],
];

/** Opaque shapes — no prefix; only known-value redaction can catch these. */
const OPAQUE_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["TOGETHER_API_KEY", "a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809"],
  ["MISTRAL_API_KEY", "AbCdEfGhIjKlMnOpQrStUvWx0123456789ABcdef"],
  ["CORTEX_ADMIN_TOKEN", "ctxadmin0AbCdEfGhIjKlMnOpQrStUvWxYz01234"],
];

test("E002-F1: prefixed provider keys are redacted by shape alone", () => {
  for (const [name, secret] of PREFIXED_KEYS) {
    // NO credential word anywhere in the line, and an EMPTY env — otherwise
    // the context rule and known-value matching cover for a missing prefix and
    // this test silently stops exercising SECRET_PREFIXES at all. The first
    // cut used "401: invalid api key <token>", which made removing a prefix a
    // no-op against the suite (caught by the inverted control run).
    const out = redactSecrets(`provider returned ${secret} unexpectedly`, {});
    assert.ok(!out.includes(secret), `${name} must be redacted by shape alone`);
    assert.match(out, /\[redacted-secret\]/, `${name} leaves the marker`);
  }
});

test("E002-F1: csk- is redacted whole, with no dangling prefix character", () => {
  // Regression guard: `csk-` used to match only via the `sk-` alternative,
  // which left the leading `c` outside the marker.
  const out = redactSecrets(`key ${k("csk", "-", BODY)} here`, {});
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
    const UNCOVERED = k("gsk", "_", BODY);

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
    const KEY = k("gsk", "_", BODY);
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
  const KEY = k("gsk", "_", BODY);

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
    k("sk", "-ant-api03-", BODY, "AbCdEfGh"),
    k("sk", "-proj-", BODY),
    k("gsk", "_", BODY),
  ]) {
    assert.doesNotMatch(redactSecrets(key, {}), new RegExp(key), "redactor covers it");
    assert.ok(gatePattern.test(`SOME_API_KEY=${key}`), `§1 scan must also catch ${key.slice(0, 12)}…`);
  }
});

/**
 * ── UNION FINDINGS (kai adversarial review of the merged fix) ──────────────
 *
 * E002-F1f — the gap BETWEEN the two mechanisms. Known-value matching is blind
 * to a key this process does not hold; prefix matching is blind to a key with
 * no prefix. A prefixless token belonging to someone else — a teammate's key
 * quoted in a pasted 401 body, an OAuth token read from a file rather than the
 * environment — falls through both. The context rule is the only mechanism
 * that catches it, and it was absent at ebc666e despite that commit's message
 * claiming absorption from the branch that introduced it.
 */
test("E002-F1f: an opaque token this process does NOT hold is redacted by context", () => {
  const foreignKey = "a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6f708192a3b4c5d6e7f809";
  for (const line of [
    `401: invalid api key ${foreignKey} for request`,
    `TOGETHER_API_KEY=${foreignKey}`,
    `Authorization: Bearer ${foreignKey}`,
  ]) {
    // env deliberately EMPTY — known-value matching cannot help here.
    const out = redactSecrets(line, {});
    assert.ok(!out.includes(foreignKey), `must be redacted by context: ${line.slice(0, 24)}…`);
    assert.match(out, /\[redacted-secret\]/, "leaves the marker");
  }
});

/**
 * E002-F1e — the context rule's false-positive guard. The anchor is what keeps
 * it from eating every git SHA, content hash and base64 blob in a persisted
 * transcript. Without the credential word beside it, a 40-hex string is just a
 * commit id and must survive.
 */
test("E002-F1e: hashes and SHAs without a credential word are NOT redacted", () => {
  const sha = "a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d";
  for (const line of [
    `commit ${sha} landed`,
    `integrity sha256-${sha}`,
    `blob ${sha} 1234 bytes`,
  ]) {
    assert.ok(redactSecrets(line, {}).includes(sha), `must survive: ${line}`);
  }
});

/**
 * E002-F1h — MECHANISM ORDER. Found by attacking the union itself: neither
 * variant had this bug, the merge created it.
 *
 * A pattern pass run before known-value matching consumes a PREFIX of a known
 * value and leaves the rest in the clear — the token classes stop at any
 * character outside `[A-Za-z0-9_-]`, and a JWT is dot-separated. Redacting the
 * header alone leaves `payload.signature`, the half that authenticates, on
 * screen; and the literal no longer matches, so the exact pass cannot recover
 * it. Exact-match must run first.
 */
test("E002-F1h: a dot-separated known value is redacted WHOLE, not fragmented", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const signature = jwt.split(".")[2]!;
  const env = { ANTHROPIC_OAUTH_TOKEN: jwt };

  const out = redactSecrets(`401 invalid token ${jwt} rejected`, env);
  assert.ok(!out.includes(signature), "the JWT signature must not survive");
  assert.ok(!out.includes(jwt), "the whole token is gone");
  assert.equal(out, "401 invalid token [redacted-secret] rejected", "replaced as one span");
});

/**
 * E002-F1i — the value guard must reject PATHS, not everything containing a
 * slash. `AWS_SECRET_ACCESS_KEY` is 40 base64 chars and routinely carries `/`
 * (the canonical AWS example value has two). A contains-a-slash guard skipped
 * the one AWS credential with no `AKIA` shape to fall back on.
 */
test("E002-F1i: a secret containing a slash is redacted; a path-valued key is not", () => {
  const awsSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  const out = redactSecrets(`403 SignatureDoesNotMatch for secret ${awsSecret} end`, {
    AWS_SECRET_ACCESS_KEY: awsSecret,
  });
  assert.ok(!out.includes(awsSecret), "AWS secret access key must be redacted");

  // …but a credential-NAMED variable holding a PATH is still left alone.
  const keyPath = "/home/operator/.ssh/id_ed25519_deploy";
  const kept = redactSecrets(`loading ${keyPath} now`, { SSH_PRIVATE_KEY: keyPath });
  assert.ok(kept.includes(keyPath), "a path-valued *_KEY is not a secret value");
});

/**
 * E002-F1d2 — the SECOND consumer of stored data. `openkai tail` was fixed to
 * redact on read; `openkai sessions` is the sibling reader and still printed
 * cleartext, which is the likelier leak of the two: an approved `bash cat .env`
 * lands in a session transcript, not the activity feed.
 */
test("E002-F1d2: openkai sessions redacts a pre-existing cleartext key on READ", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oke002-sess-"));
  try {
    const KEY = k("gsk", "_", BODY);
    const sessionId = "01920000-0000-7000-8000-000000000001";
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(root, sessionId), { recursive: true });
    // Written as a PRE-FIX OpenKai would have written it: no redaction.
    await writeFile(
      path.join(root, sessionId, "session.jsonl"),
      [
        JSON.stringify({ type: "header", version: 3, id: sessionId, createdAt: 0, parentSessionId: null }),
        JSON.stringify({
          type: "message",
          id: "e1",
          seq: 1,
          parentId: null,
          timestamp: 0,
          message: { role: "user", content: `here is my key ${KEY} use it` },
        }),
      ].join("\n") + "\n",
    );

    const chunks: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stdout.write;
    try {
      await runSessions({ root });
      await runSessions({ root, show: sessionId });
    } finally {
      process.stdout.write = write;
    }

    const output = chunks.join("");
    assert.doesNotMatch(output, new RegExp(KEY), "sessions must not print the stored key");
    assert.match(output, /\[redacted-secret\]/, "sessions shows the marker instead");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * DRIFT GUARD — the root cause of F2 was two hand-maintained copies of one
 * list. This fails the moment a prefix is added to secrets.ts without also
 * teaching the commit-time scan about it.
 *
 * FUNCTIONAL, not substring (kai review item (g)): the first cut asserted only
 * that each prefix string appeared somewhere in the §1 line, which a prefix
 * carrying a broken quantifier (`hf_[A-Za-z0-9]{200,}`) or no quantifier at
 * all passes trivially while catching nothing. Compiling §1 and running a
 * synthesised key of each shape through it is the assertion that has teeth.
 */
test("E002-F2 drift guard: §1 actually MATCHES a key of every SECRET_PREFIXES shape", async () => {
  const script = await readFile(path.join(REPO_ROOT, "scripts/security-audit.sh"), "utf-8");
  const line = script.split("\n").find((l) => l.includes("secret_hits=")) ?? "";
  const match = /git grep -nE '\((.+)\)' --/.exec(line);
  assert.ok(match, "the §1 pattern must be extractable");
  const gatePattern = new RegExp(match[1]!);

  // `AKIA` is the one shape with a fixed-width, upper-only body.
  const sample = (prefix: string): string =>
    prefix === "AKIA" ? k("AKIA", "IOSFODNN7EXAMPLE") : prefix + BODY;

  const missed = SECRET_PREFIXES.filter((p: string) => !gatePattern.test(`SOME_API_KEY=${sample(p)}`));
  assert.deepEqual(missed, [], `security-audit.sh §1 fails to MATCH these shapes: ${missed.join(", ")}`);
});

/**
 * E002-F2b — this suite's own fixtures must never trip §1.
 *
 * The class-level fix for the regression found reviewing ebc666e: that commit
 * tracked this file with literal canary keys, so `security-audit.sh` §1 —
 * which greps tracked source for exactly those shapes — reported 14 hits and
 * the gate went RED at the very commit whose message recorded "audit PASSED".
 * It passed when measured because `git grep` skips UNTRACKED files.
 *
 * This runs the real §1 pattern over the security test sources, so the failure
 * surfaces in `npm test` rather than at commit time.
 */
test("E002-F2b: security test sources carry no literal secret-shaped fixture", async () => {
  const script = await readFile(path.join(REPO_ROOT, "scripts/security-audit.sh"), "utf-8");
  const line = script.split("\n").find((l) => l.includes("secret_hits=")) ?? "";
  const gatePattern = new RegExp(/git grep -nE '\((.+)\)' --/.exec(line)![1]!, "g");

  // The TypeScript SOURCE tree, resolved from REPO_ROOT — NOT from
  // import.meta.url, which at runtime points at `dist-test/` where only
  // compiled `.test.js` exists. The first cut filtered for `.test.ts` there,
  // matched zero files, and passed by scanning nothing (caught by the inverted
  // control run). §1 greps tracked SOURCE, so source is what must be scanned.
  const testDir = path.join(REPO_ROOT, "packages/cli/test");
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(testDir)).filter((f) => f.endsWith(".test.ts"));
  assert.ok(files.length > 0, "the scan must actually read test sources, not silently find none");

  const offenders: string[] = [];
  for (const file of files) {
    const source = await readFile(path.join(testDir, file), "utf-8");
    for (const hit of source.match(gatePattern) ?? []) offenders.push(`${file}: ${hit.slice(0, 24)}…`);
  }
  assert.deepEqual(
    offenders,
    [],
    `literal canaries in tracked test source turn security-audit.sh §1 RED — assemble them at runtime (see k()):\n${offenders.join("\n")}`,
  );
});

/**
 * Write a session transcript exactly as a PRE-FIX OpenKai would have: the key
 * in cleartext on disk. Every redact-on-read reproducer starts here — the file
 * outlives the version that wrote it, so the reader is the only seam that can
 * still save you.
 */
async function writePreFixSession(root: string, sessionId: string, body: string): Promise<string> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(path.join(root, sessionId), { recursive: true });
  const filePath = path.join(root, sessionId, "session.jsonl");
  await writeFile(
    filePath,
    [
      JSON.stringify({ type: "header", version: 3, id: sessionId, createdAt: 0, parentSessionId: null }),
      JSON.stringify({
        type: "message",
        id: "e1",
        seq: 1,
        parentId: null,
        timestamp: 0,
        message: { role: "user", content: body },
      }),
    ].join("\n") + "\n",
  );
  return filePath;
}

/**
 * E002-F1d3 — the THIRD consumer. `openkai tail` (F1d) and `openkai sessions`
 * (F1d2) redact on read; the TUI resume path did not. `/resume` and
 * `openkai chat --resume` replay a stored transcript through app.ts
 * `messageText`, which returned raw content — the worst of the three, because
 * resume renders FULL message text rather than a 60-char snippet.
 *
 * Drives the REAL read path (core `readSessionMessages`) into the REAL exported
 * display helper — not a replica of the wiring.
 */
test("E002-F1d3: TUI resume replay redacts a pre-existing cleartext key on READ", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oke002-resume-"));
  try {
    const KEY = k("tgp", "_v1_", BODY);
    const filePath = await writePreFixSession(root, "01920000-0000-7000-8000-000000000003", `token ${KEY} here`);

    const messages = await readSessionMessages(filePath);
    assert.equal(messages.length, 1, "the real read path returned the stored turn");
    const rendered = messages.map((m) => messageText(m)).join("\n");

    assert.doesNotMatch(rendered, new RegExp(KEY), "resume replay must not repaint the stored key");
    assert.match(rendered, /\[redacted-secret\]/, "resume replay shows the marker instead");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * E002-F1d4 — the FOURTH consumer, found porting the union forward onto the
 * current main. `readSessionSearchRows` did not exist when the union was
 * certified; it now builds BOTH row fields straight from stored text, and two
 * separate seams render them: the `openkai sessions` listing (`sessions.ts`,
 * which bypasses `contentSnippet` entirely) and the `/resume` picker's item
 * description (`session-search.ts buildList`, which sanitises the NAME for
 * terminal escapes but never redacted the description). `allMessagesText` is
 * the search haystack over the whole corpus.
 *
 * A new reader surface bypasses the existing seams — redacting at the row
 * construction chokepoint covers every consumer at once.
 */
test("E002-F1d4: session search rows redact stored keys in BOTH row fields", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oke002-rows-"));
  try {
    const KEY = k("gsk", "_", BODY);
    await writePreFixSession(root, "01920000-0000-7000-8000-000000000004", `here is my key ${KEY} use it`);

    const rows = await readSessionSearchRows(root, { withText: true });
    assert.equal(rows.length, 1, "the real production reader returned the session row");
    const row = rows[0];
    assert.ok(row, "row present");

    assert.doesNotMatch(row.firstUserMessage, new RegExp(KEY), "listing + picker description must not carry the key");
    assert.match(row.firstUserMessage, /\[redacted-secret\]/, "firstUserMessage shows the marker instead");
    assert.doesNotMatch(row.allMessagesText, new RegExp(KEY), "the search haystack must not carry the key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
