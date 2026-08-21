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
therefore redact on READ.** Five consumers exist today, and all five redact:

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
5. `/export` HTML transcript (F1d5) — `renderText` in
   `packages/cli/src/tui/export-html.ts`, the single render seam every string
   enters the document through: redact, THEN truncate (the consumer-2
   ordering — a key sliced below its pattern's length floor is still a leaked
   key), THEN HTML-escape. Covers message text, tool-call arguments,
   tool-result bodies, compaction summaries, and the session name/title.

Consumers 4 and 5 are the standing lesson, proved twice: `readSessionSearchRows`
did not exist when the union below was certified, and `/export` predated this
section — in both cases a **new reader surface silently bypassed the existing
seams** (the export even carried its own non-redacting replica of consumer 3's
`messageText`). Redaction therefore lives at the row/block-construction
chokepoint, not at each render, so a future caller cannot bypass it. When
adding any reader of stored session data, enumerate it here and add a
reproducer.

### Deliberate exception — `/export <path>.jsonl`

The `.jsonl` branch of `/export` (`app.ts`) is a **byte-faithful copy of the
raw session file** and is exempt from redact-on-read BY DESIGN: a redacted
copy could not seed a resume (the same reason consumer 3 redacts DISPLAY ONLY
while `initialMessages` stays raw). Compensating controls: the copy is written
with the session store's owner-only `0600` mode, and the TUI notice names it a
RAW unredacted copy at the moment of export. Anything that would redact this
branch breaks its purpose; anything that widens its exposure (default mode,
location, any future remote destination) must come back through this section.

Each consumer has an inverted control in
`packages/cli/test/security-repro-e002.test.ts`: reverting any one redaction
fails its own reproducer and no other (reverting consumer 4 additionally fails
F1d2, because the listing renders through it).

### E002 §2 CPO sign-off — 2026-08-22

**SIGNED — ren@openkai.** Independently attested against the literal
`origin/main` tree `c169f26a0b4daae9a2d42e22f3f82fb22c1094d4`. The ordering
controls were first executed at its `bab5b4b2343324737a12a092ee5eab588444ca47`
ancestor; `98b7be0`, `f048ff5`, `aaf6a37`, and `bab5b4b` are all confirmed as
ancestors of the signed tree. Ren's `aacf9cf` contribution changes export
palette/CSS only and authors no `renderText` mechanism line. The five consumers
above are present. For F1d5, each source mutation was rebuilt and confirmed in
both source and compiled `dist`: truncate-before-redact produced 18/19 passing
E002 reproducers with F1d5 the sole failure on the half-key boundary assertion;
removing redaction produced 18/19 with F1d5 the sole failure on cleartext in the
session title. Both controls were then re-executed at `c169f26` with the same
sole F1d5 failures; restoring redact, then truncate, then escape returned the
current tree to 19/19. The current-tip full suite passed 464/464 and the security
audit passed. The ordering is therefore falsifiably proven; no ordering carve-out
is required.

**`.jsonl` exception ruling: ACCEPT within the documented boundary.** The
byte-faithful raw copy is required to preserve resume semantics, is constrained
to owner-only `0600`, and is accompanied by an explicit RAW/unredacted warning
at export. Its byte-faithful/owner-only production-path test passes. Any wider
mode, location, or remote destination reopens this ruling for review.

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
