/**
 * Secret-shape detection, shared by every boundary that must not leak one
 * (E001 security gate, findings F7/F9). One copy of the patterns: a security
 * regex that drifts between call sites is its own defect class.
 *
 * The value patterns mirror `scripts/security-audit.sh` §1 — the same provider
 * token shapes the per-increment secret scan already gates on.
 */

/**
 * Provider token / private-key shapes, as they appear in free text. Built from
 * one source so the matcher and the redactor can never disagree — and so the
 * `test()` copy stays non-global (a `/g` regex's `lastIndex` makes `test()`
 * stateful across calls).
 */
const SECRET_VALUE_SOURCE =
  "(sk-[A-Za-z0-9_-]{10,}|nvapi-[A-Za-z0-9_-]{10,}|fw_[A-Za-z0-9_-]{10,}|AIza[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|xai-[A-Za-z0-9_-]{10,}|-----BEGIN (?:RSA |OPENSSH |EC |PGP )?PRIVATE KEY-----)";

/** Non-global — safe for repeated `test()`. */
export const SECRET_VALUE_PATTERN = new RegExp(SECRET_VALUE_SOURCE);

const SECRET_VALUE_GLOBAL = new RegExp(SECRET_VALUE_SOURCE, "g");

/** Env var NAMES that carry credentials regardless of their value's shape. */
export const SECRET_NAME_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|SESSION)/i;

/**
 * Replace secret-shaped spans with a fixed marker.
 *
 * ponytail: shape-matching, so it is a blast-radius reducer, not a guarantee —
 * a novel token format passes through. SECURITY.md §4 still says secrets live
 * in `.env` and nowhere else; this catches the realistic path where an approved
 * `bash cat .env` puts one into a turn that is then persisted. Widen the
 * patterns when a provider ships a new shape.
 */
export function redactSecrets(text: string): string {
  return text.replace(SECRET_VALUE_GLOBAL, "[redacted-secret]");
}
