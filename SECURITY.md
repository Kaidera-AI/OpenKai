# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.** Use GitHub's private vulnerability reporting (Security tab → "Report a vulnerability") on this repository. Include a reproducer — a script, command sequence, or failing test that demonstrates the issue.

You will get an acknowledgement within 72 hours and a triage verdict (severity + fix plan or reasoned dismissal) within 7 days.

## Scope

OpenKai is an agent harness: it runs shell commands, writes files, and talks to model providers **with the operator's own privileges, by design and with explicit operator consent**. Our permission engine is *consent, not a sandbox* — we say so plainly in the docs, and reports should treat that as the documented posture, not a finding.

In scope as vulnerabilities:

- **Permission bypass**: reaching `write_file`/`edit_file`/`bash` effects without an operator approval (path traversal past the cwd guard, deny-floor escape, rule-ordering tricks, approval-cache poisoning).
- **Remote approval injection**: driving the approval channel from outside the local, in-process operator path.
- **Secret exfiltration**: API keys or `.env` content landing in sessions, artifacts, logs, transcripts, or outbound payloads.
- **Supply chain**: tampered upgrade manifests, downgrade/rollback-to-vulnerable paths, unsigned release channels.
- **Terminal injection**: model- or server-supplied content escaping ANSI/OSC sanitisation into terminal control sequences.
- **Cross-project leakage** in Cortex-managed mode: one project's memory readable from another.

Out of scope (documented posture): the raw power of an *approved* `bash` call; social-engineering the operator into approving; issues in upstream pi-* packages (report those to `earendil-works/pi` — we pin and track).

## Activity feed redaction (F7/F6c class)

`.openkai/activity.jsonl` receives every session event and every Shift routing
event (stage classification, model selection, provider fallback). All string
fields are passed through `redactSecrets` at TWO layers before the row is
serialised to disk:

1. **Core-side** (`packages/core/src/shift/activity.ts`): the
   `createRedactingSink` wrapper applies `redactRoutingEvent` to every
   routing event before it reaches the caller's sink.
2. **CLI-side** (`packages/cli/src/tail.ts`): `appendActivity` applies
   `redactStrings` (a recursive `redactSecrets` over all string fields) to
   every row — session events AND routing events — before `JSON.stringify`.

This closes a pre-existing gap where `appendActivity` wrote activity rows
unredacted: a provider error that echoes an API key back in a 401/429 body
(`sk-…`, `nvapi-…`, etc.) is replaced with `[redacted-secret]` at both layers.
The reproducer in `packages/cli/test/shift.test.ts` proves the redaction fires
on the exact production path — the jsonl file and `openkai tail` output are
both clean.

## Redact-on-read: stored transcripts (E002 §2, F1d class)

Redacting on WRITE is necessary but never sufficient. A session file outlives
the version that wrote it: a turn recorded before the redactor covered a given
provider still holds that key in cleartext on disk, and no future write-seam
fix can retroactively clean it. **Every reader of stored session data must
therefore redact on READ.** Four consumers exist today, and all four redact:

1. `openkai tail` (F1d) — `packages/cli/src/tail.ts`.
2. `openkai sessions --show` (F1d2) — `contentSnippet` in
   `packages/cli/src/sessions.ts`. Redacts BEFORE slicing: slicing first can
   cut a token below the pattern's length floor, and a half-printed key is
   still a leaked key.
3. TUI resume replay (F1d3) — `messageText` in `packages/cli/src/tui/app.ts`.
   The worst of the four, because resume renders FULL message text rather than
   a snippet. DISPLAY ONLY: the raw messages still seed the model context via
   `initialMessages` in `runtime.ts`, which must NOT be redacted or the resumed
   conversation loses its history.
4. Session search rows (F1d4) — `entryText` in
   `packages/cli/src/tui/session-search.ts`, which feeds BOTH the
   `openkai sessions` listing (a seam that bypasses `contentSnippet` entirely)
   and the `/resume` picker's item description, plus the `allMessagesText`
   search haystack.

Consumer 4 is the standing lesson: `readSessionSearchRows` did not exist when
the union below was certified, and a **new reader surface silently bypassed the
existing seams**. Redaction therefore lives at the row-construction chokepoint,
not at each render, so a future caller cannot bypass it. When adding any reader
of stored session data, enumerate it here and add a reproducer.

Each consumer has an inverted control in
`packages/cli/test/security-repro-e002.test.ts`: reverting any one redaction
fails its own reproducer and no other (reverting consumer 4 additionally fails
F1d2, because the listing renders through it).

### Provenance correction — `ebc666e`

For anyone reading the commit graph: `ebc666e` carries the message
"fix absorption (from 67e0273)", but `67e0273` is **not** an ancestor of `main`
and none of its mechanisms are present in `ebc666e`'s tree. `ebc666e` is the
parallel *known-value* variant, not an absorption of the prefix-shape variant.
The two strategies are complements, and the real union of them — known-value
matching, the `tgp_v1_` prefix shape, and the `OPAQUE_AFTER_CREDENTIAL_WORD`
context anchor, ordered most-precise-first — landed in the commit that added
this section. A commit message is a claim; the diff is the fact.

## Supported versions

Pre-1.0: only the latest `main` and the most recent release receive fixes.