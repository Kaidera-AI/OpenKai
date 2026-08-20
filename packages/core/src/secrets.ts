/**
 * Secret-shape detection, shared by every boundary that must not leak one
 * (E001 security gate, findings F7/F9; E002 findings F1/F2). One copy of the
 * patterns: a security regex that drifts between call sites is its own defect
 * class.
 *
 * THREE mechanisms, because no one of them is enough (E002-F1). They are
 * complements, not alternatives — each catches what the others structurally
 * cannot:
 *
 *  1. **Known-value matching** ({@link knownSecretValues}) — several providers
 *     OpenKai supports issue OPAQUE tokens with no prefix at all (together:
 *     64 hex; mistral: 32 alphanumerics; `CORTEX_ADMIN_TOKEN`). No shape can
 *     match those without also matching git SHAs and ordinary identifiers, so
 *     instead we redact the literal values this process actually holds —
 *     `process.env` entries whose NAME is credential-shaped. Zero false
 *     positives by construction: we only redact a string we know is a secret.
 *     Blind to any key this process does not hold.
 *  2. **Shape matching** ({@link SECRET_PREFIXES}) — provider tokens carry a
 *     distinctive prefix. Cheap, works on text from anywhere, catches a key
 *     this process has never held. Blind to prefixless tokens.
 *  3. **Context matching** ({@link OPAQUE_AFTER_CREDENTIAL_WORD}) — a long
 *     opaque token sitting immediately after a credential word. Catches a
 *     prefixless key this process does NOT hold, which is precisely the gap
 *     mechanism 1 and mechanism 2 leave between them (a teammate's key quoted
 *     in a pasted error body, an OAuth token read from a file rather than the
 *     environment).
 *
 * ORDER IS LOAD-BEARING, see {@link redactSecrets}.
 *
 * The prefix list is mirrored by `scripts/security-audit.sh` §1 (the
 * commit-time scan). They are two implementations of one list, so
 * `security-repro-e002.test.ts` asserts the shell script covers every prefix
 * below — E002-F2 was exactly this pair drifting apart unnoticed.
 */

/**
 * Provider token prefixes, as they appear in free text. Exported so the
 * drift test can assert `scripts/security-audit.sh` §1 covers the same set.
 *
 * `csk-` is listed explicitly: it was previously matched only by accident,
 * via the `sk-` alternative, which redacted `csk-XXX` as `c[redacted-secret]`
 * and left the leading character exposed.
 */
export const SECRET_PREFIXES: readonly string[] = [
  "sk-", // openai, anthropic, deepseek, openrouter (sk-or-), kimi (sk-kim)
  "csk-", // cerebras
  "nvapi-", // nvidia
  "gsk_", // groq
  "hf_", // huggingface
  "fw_", // fireworks
  "tgp_v1_", // together
  "xai-", // xai
  "AIza", // google / gemini
  "github_pat_", // github fine-grained PAT
  "AKIA", // aws access key id
];

/** PEM private-key headers — not a prefix-shaped token. */
const PRIVATE_KEY_SOURCE = "-----BEGIN (?:RSA |OPENSSH |EC |PGP )?PRIVATE KEY-----";

/**
 * The alternation. Longer prefixes are matched at the position they start, so
 * `csk-` wins over `sk-` on `csk-…` regardless of list order.
 *
 * `gh[opusr]_` covers the whole GitHub classic family (ghp_ personal, gho_
 * oauth, ghu_ user-to-server, ghs_ server-to-server, ghr_ refresh) — the
 * previous pattern caught only `ghp_`.
 */
const SECRET_VALUE_SOURCE = `(${[
  "sk-[A-Za-z0-9_-]{10,}",
  "csk-[A-Za-z0-9_-]{10,}",
  "nvapi-[A-Za-z0-9_-]{10,}",
  "gsk_[A-Za-z0-9_-]{10,}",
  "hf_[A-Za-z0-9]{10,}",
  "fw_[A-Za-z0-9_-]{10,}",
  "tgp_v1_[A-Za-z0-9_-]{10,}",
  "xai-[A-Za-z0-9_-]{10,}",
  "AIza[A-Za-z0-9_-]{10,}",
  "github_pat_[A-Za-z0-9_]{10,}",
  "gh[opusr]_[A-Za-z0-9]{10,}",
  "AKIA[0-9A-Z]{16}",
  PRIVATE_KEY_SOURCE,
].join("|")})`;

/** Non-global — safe for repeated `test()`. */
export const SECRET_VALUE_PATTERN = new RegExp(SECRET_VALUE_SOURCE);

const SECRET_VALUE_GLOBAL = new RegExp(SECRET_VALUE_SOURCE, "g");

/**
 * Opaque tokens — together, mistral, `CORTEX_ADMIN_TOKEN`, an OAuth bearer,
 * and any provider that ships a bare random string — have no prefix to key on,
 * so they are caught by CONTEXT: a long token sitting immediately after a
 * credential word. That covers the realistic leak, which is a provider error
 * body or an env dump echoing the key back (`401: invalid api key <token>`,
 * `TOGETHER_API_KEY=<token>`, `Authorization: Bearer <token>`).
 *
 * This is the mechanism that fires for a key this process does NOT hold, so it
 * is not made redundant by {@link knownSecretValues} — a teammate's key pasted
 * into a bug report, or a token OpenKai reads from an OAuth file rather than
 * the environment, is caught here and nowhere else.
 *
 * ponytail: the anchor is load-bearing, not decoration. An unanchored
 * "20+ opaque chars" rule would redact every git SHA, content hash and base64
 * blob in a persisted transcript (guarded by test E002-F1e). Lookbehind keeps
 * the credential word intact in the output so the redacted line still reads.
 *
 * KNOWN CEILING: a prefixless token with NO credential word beside it and not
 * held by this process is not matched — nothing distinguishes it from a hash
 * at that point. Upgrade path: add the provider's prefix above once it has one.
 */
const OPAQUE_AFTER_CREDENTIAL_WORD = new RegExp(
  "(?<=(?:key|token|secret|password|credential|bearer|authorization)[\"'`\\s:=,]{1,6})" +
    "[A-Za-z0-9][A-Za-z0-9_-]{19,}",
  "gi",
);

/** Env var NAMES that carry credentials regardless of their value's shape. */
export const SECRET_NAME_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|SESSION)/i;

/**
 * Env var names whose VALUE may be redacted from output. Deliberately TIGHTER
 * than {@link SECRET_NAME_PATTERN}, because the two decide opposite things and
 * have opposite failure modes.
 *
 * `SECRET_NAME_PATTERN` decides which variables a model-authored gate check
 * may INHERIT (`fusion/gate.ts`). Over-matching there is fail-safe — dropping
 * `SSH_AUTH_SOCK` from a model's shell is a feature, not a bug.
 *
 * Redacting too much from OUTPUT is not fail-safe: it blanks socket paths and
 * session ids out of activity logs and transcripts for no security gain. A
 * real shell carries `SSH_AUTH_SOCK` (a 47-char path), `SECURITYSESSIONID`,
 * and `CLAUDE_CODE_SESSION_ID` (a uuid) — all credential-NAMED, none secret.
 *
 * Anchored at the END, so `*_KEY` / `*_TOKEN` match while `SSH_AUTH_SOCK`
 * (…_SOCK), `CLAUDE_CODE_SESSION_ID` (…_ID) and `…_SESSION` do not. Every
 * credential in `.env.example` is named `*_API_KEY` or `*_TOKEN`.
 */
const REDACTABLE_NAME_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)$/i;

/** The marker every redaction leaves behind. */
const MARKER = "[redacted-secret]";

/**
 * Minimum length for known-value redaction. A credential-named variable set
 * to something short (`CI_TOKEN=1`, `AUTH=on`) is not a secret worth
 * redacting, and blanking every `1` in the output would be its own bug.
 */
const MIN_KNOWN_VALUE_LENGTH = 12;

/**
 * The literal credential values this process holds: `process.env` entries
 * whose NAME is credential-shaped and whose value is long enough, and shaped
 * plausibly enough, to be a real token. Longest first, so a value that is a
 * substring of another does not fragment the longer one's replacement.
 *
 * Read fresh on each call rather than cached at module load — the CLI
 * auto-loads `.env` after import, and tests set variables per-case. The list
 * is short (tens of entries) and this runs once per redacted string, not per
 * streamed token.
 */
function knownSecretValues(env: NodeJS.ProcessEnv = process.env): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (value.length < MIN_KNOWN_VALUE_LENGTH) continue;
    if (!REDACTABLE_NAME_PATTERN.test(name)) continue;
    // A credential-NAMED variable can still hold a path (`SSH_PRIVATE_KEY`
    // pointing at a file) or a sentence; blanking those from output is pure
    // noise. Second guard behind the name anchor, cheap and kills a class.
    //
    // Deliberately a PATH-PREFIX test, not "contains a slash": a real secret
    // can contain a slash mid-string. `AWS_SECRET_ACCESS_KEY` is 40 chars of
    // base64 and the canonical example value carries two of them, so a
    // contains-a-slash guard skipped the one AWS credential that has no `AKIA`
    // shape to fall back on. Paths and drive letters START with the separator;
    // secrets do not.
    if (/\s/.test(value)) continue;
    if (/^(?:[A-Za-z]:[\\/]|~?\.{0,2}\/)/.test(value)) continue;
    values.push(value);
  }
  return values.sort((a, b) => b.length - a.length);
}

/**
 * Replace secret-shaped spans, and any known credential value, with a fixed
 * marker.
 *
 * ORDER IS LOAD-BEARING — most precise mechanism first:
 *
 *  1. **Known values**, because they are exact literals. A pattern pass run
 *     first can consume a PREFIX of a known value and leave the rest in the
 *     clear: the token classes here stop at any character outside
 *     `[A-Za-z0-9_-]`, and a JWT (`ANTHROPIC_OAUTH_TOKEN`) is dot-separated.
 *     Redacting `header` alone leaves `payload.signature` — the half that
 *     matters — exposed, and the literal no longer matches so pass 3 cannot
 *     recover it. Exact-match first, then nothing is left to fragment.
 *  2. **Prefixed shapes**, whose marker starts with `[` — a character the
 *     opaque token class rejects, so pass 3 cannot re-match pass 2's output.
 *  3. **Opaque-after-credential-word**, the loosest rule, last.
 *
 * ponytail: shape matching stays a blast-radius reducer, not a guarantee. The
 * three mechanisms cover different halves of the problem — see the file header.
 * Widen the prefix list when a provider ships a new shape; the drift test will
 * tell you to update the shell scan too.
 */
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const value of knownSecretValues(env)) {
    // split/join rather than RegExp — no metacharacter escaping to get wrong.
    // Longest-first (see knownSecretValues) so a short secret cannot fragment
    // a longer one that contains it.
    if (out.includes(value)) out = out.split(value).join(MARKER);
  }
  return out
    .replace(SECRET_VALUE_GLOBAL, MARKER)
    .replace(OPAQUE_AFTER_CREDENTIAL_WORD, MARKER);
}
