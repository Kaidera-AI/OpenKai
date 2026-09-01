# INC 05 GATE — trust surface + KOS closure (2026-09-01)

**Fork commit:** `6dd1f30b6e` (+ `7ff7212ffd`)

## Security equivalence suite (the 0.84 certified classes, re-proven)

The 0.84 `security-repro-*` suites are bound to the retired `@kaidera/openkai-core`
architecture; Inc 05 re-proves the SAME classes against the seams that ship now.
`test/openkai-security-equivalence.test.ts` — 10/10 green, canaries assembled at
runtime (never literal — the 0.84 scanner discipline):

| Class | Proven on the fork seam |
|---|---|
| E002-F1 | provider prefix coverage (sk-, gsk_, csk-, sk-or-, sk-kimi, xai-) redacts in free text; known-value path catches shapeless opaque tokens; PEM headers redact (bodies via known-value) |
| F4/F10 | deny floor: protected node + contents + the `.ssh` node itself denied; ancestor-walk containment (`.env/production` cannot escape); clean paths pass |
| F7 | redacting activity sink fires on every string field of a routing event (a provider 401 echoing a key is redacted at the sink boundary); clean events untouched |
| procenv | spawned children never inherit credential-shaped env; operator-explicit overrides win |

Plus the floor's own E021 F3 gate (`openkai-floor.test.ts`, 3/3) and the CI-driven
containment refinement: system temp is exempt scratch (upstream SDK sandboxes every
session under `os.tmpdir()`), but a session sandboxed inside temp keeps strict
containment against its own folder, and DENY_FLOOR secret patterns still apply in
temp. All four behaviours pinned by tests.

## KOS six-ask reply — SENT (repo-document channel)

`docs/HANDOFF_TO_KAIDERA_OS_TUI_TERMINAL_REPLY.md` (committed `8314055629`). The
original arrived as a repo document (the openkai project is not registered in the
kaidera-os Cortex instance), so the reply ships the same way. Answers: PTY submit ✓,
session pinning native (`--session`/`--session-dir`), alt-screen replay contract,
headless-vs-TUI constraint, Cortex checkpoint parity, theme contract delivered.
**Minimum version named: 0.1.10.** Separate from the PTT transfer `f5dc2930`.

## Cortex registration — OPERATOR ACTION (blocked, not code)

`openkai` is MISSING from the shared API project registry (localhost:8501 — live
probe confirms: `kaidera-os`, `kaidera`, `2nd-brain`, … present; `openkai` absent,
`/projects/openkai` → 404). Until the operator restores it via `cortex-init-project`
(at `~/DevVault/kaidera-os-worktrees/canonical-integration/.agents/scripts/`),
managed-mode ingest queues and boot 404s are ENVIRONMENTAL, not code defects.
The code seam is ready and green (`cortex-memory.ts` registers cortex_search/
cortex_record when `CORTEX_PROJECT` is set); only the registration is missing.
