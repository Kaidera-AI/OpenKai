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

## Supported versions

Pre-1.0: only the latest `main` and the most recent release receive fixes.