# E001 Security Gate — standing protocol

**Owner:** cole@openkai (security-engineer; Strix skills bound: penetration-testing, fix-security-vulnerabilities, ci-security-scanning)
**Rule:** no increment is accepted without this gate passing. Pattern source: ren's Strix skill set (ported at `.agents/skills/`) applied as *patterns* — no full Strix install required for the per-increment gate.

## 1. Per-increment gate (fast, automatable — runs on every increment)

`scripts/security-audit.sh` must pass:
1. **Secret scan** — no API keys/tokens in tracked files (pattern scan for `sk-`, `nvapi-`, `fw_`, `AIza`, `ghp_`, `xai-`, private-key blocks); `.env`/`.openkai/` never tracked.
2. **Dependency audit** — `npm audit --audit-level=high` clean; new dependencies justified against ADR §5.
3. **Injection surfaces** — new shell-executing or path-resolving code has adversarial tests (traversal, metacharacters, deny-floor bypass attempts).
4. **Test suite green** — the security-relevant tests (permission matrix, traversal guards, attribution enforcement) must exist and pass.

## 2. Per-increment review (cole, Strix patterns, white-box)

For each increment's diff, cole reviews the NEW attack surface with the penetration-testing skill's methodology (validate-by-exploitation, not flagging):

| Surface introduced | Attack class to attempt |
|---|---|
| Permission engine / gated tools | Rule-ordering bypass, deny-floor escape, symlink/encoded-path traversal, bash obfuscation, always-cache poisoning |
| Session persistence + Cortex ingest | Secret exfiltration into sessions/artifacts, cross-project scope leak, injection via session content |
| SSE client / event stream | Frame injection, cursor forgery, cross-project event leak |
| TUI rendering | ANSI/OSC escape injection from model output into the terminal (the classic agent-TUI hole) |
| Fusion (panel/synthesis/gate) | Prompt injection via role output into the synthesiser/validator; gate command injection via validator output |
| Upgrade/packaging | Supply-chain: unsigned channel, rollback to vulnerable version, downgrade attacks |
| Shadow-git undo | Restore-path escape outside cwd, object-store poisoning |

Findings are filed as Cortex handoffs with severity + reproducer; acceptance of the increment waits on critical/high closure.

### 2.1 Outcome table — E001 re-review, 2026-08-16 (cole@openkai, tip `e32701e`; rows 16–22 fixed by kai@openkai)

Second pass after the fabricated first review (findings `eba8cb9`) and the fixes at
`09b56ce` + `3f89a45`, plus a third pass verifying the fixes kai landed *during* this
review (`1d46b35`, `e32701e`), plus kai's fixes for the six findings that pass left open
(rows 16–22). Every outcome below is backed by a named test that exists on disk and
executes (§4 admissibility rule); **106/106 green** and `security-audit.sh` PASSED after
the fixes. Reproducers live in `packages/cli/test/security-repro.test.ts` unless stated
otherwise. `LIVE` reproducers assert the current vulnerable behaviour so they pass on the
vulnerable tree and prove the exploit — they are inverted when the fix lands, exactly as
REPRO 1–3 and REPRO 6 were, and an inversion is only credible when the inverted test is
shown to FAIL against the pre-fix source (see the control run below).

| # | Attack class | Outcome | Reproducer |
|---|---|---|---|
| 1 | Symlink escape of cwd containment (`read_file` via in-cwd symlink) | **HELD** — fix verified | `REPRO 1` |
| 2 | Deny-floor escape by case variance (`.ENV`/`.Env`/`.eNv`, APFS) | **HELD** — fix verified | `REPRO 2`, `HELD: every case variant…` |
| 3 | Deny-floor escape by depth (nested `.git/config`, `vendor/x/.env`) | **HELD** — fix verified | `REPRO 3` |
| 4 | Deny floor as a tool-layer boundary (read-only trio never consults `evaluate`) | **HELD** | `GUARD: read_file refuses floor files…` |
| 5 | Recursive `grep` surfacing floor-file content | **HELD** | `GUARD: recursive grep never surfaces…` |
| 6 | `write_file` through a symlinked parent dir landing outside cwd | **HELD** | `HELD: write_file through a symlinked parent…` |
| 7 | `edit_file` through a symlinked parent dir tampering outside cwd | **HELD** | `HELD: edit_file through a symlinked parent…` |
| 8 | Rule-ordering bypass (attacker `allow` rules vs the floor) | **HELD** — floor precedes the rule walk | `HELD: no allow rule can override…` |
| 9 | `always`-cache poisoning (replaying an approval onto a floor path) | **HELD** — floor precedes the cache | `HELD: an always-approval cannot be replayed…` |
| 10 | Bash obfuscation / auto-allow escalation | **HELD** — `bash` can never exceed `ask` | `HELD: bash is never auto-allowed…` |
| 11 | Read-only trio escaping via a symlinked directory | **HELD** | `HELD: list_files and grep cannot escape…` |
| 12 | Shadow-git undo restore-path escape outside cwd | **HELD** — not reachable (git does not descend symlinks; non-recursive `rm` unlinks the link) | `HELD: shadow-git undo cannot delete outside cwd…` |
| 13 | ANSI/OSC injection via streamed deltas, thinking, replay, user paste, tool results | **HELD** — `1d46b35` fix verified at each entry point | `REPRO 6` (inverted) |
| 14 | Upgrade/packaging supply chain (unsigned channel, digest mismatch, channel pin) | **HELD** — negative paths tested | `upgrade.test.ts`: sha256 mismatch refused; unsigned manifest refused when a key is pinned; `OPENKAI_CHANNEL` never overwrites `process.execPath` |
| 15 | Build cache + prebuilt binaries tracked in git (defeated the §1 secret scan) | **FIXED** — `e32701e`; 0 tracked cache files, 0 tracked binaries, audit PASSED | `scripts/security-audit.sh` |
| 16 | Deny-floor blind spot: protected name as a DIRECTORY component | **HELD** — F4 fixed; floor tests every ancestor prefix | `REPRO 4` (inverted) |
| 17 | Consent surface (`PermissionOverlay`) renders model-supplied escapes | **HELD** — F6b fixed; every field sanitised, single-line fields flattened | `REPRO 8` (inverted) |
| 18 | `edit_file` pre-gate read = content oracle over floor files | **HELD** — F5 fixed; `guardPath` precedes any read | `REPRO 5` (inverted) |
| 19 | `edit_file` pre-gate read = content/existence oracle outside cwd | **HELD** — F5b fixed; same guard | `REPRO 5b` (inverted) |
| 20 | Sanitiser residue: `tool_call` name/args + `/btw` header | **HELD** — F6c fixed; card name + arg keys/values + btw header sanitised | `REPRO 9` (inverted) |
| 21 | Fusion gate consent is fail-open (absent `approveGate` = approved) | **HELD** — F9 fixed; absent consent channel = refusal, child env scrubbed | `fusion.test.ts`: `REPRO 9 (fusion)` (inverted) + `gate consent: an approved check does not inherit secret-shaped env vars` |
| 22 | Secret exfiltration into sessions (verbatim + world-readable mode) | **HELD** — F7 fixed; span redaction at the write seam + 0700/0600 tree | `REPRO 7` (inverted) |
| 23 | SSE frame injection / cursor forgery | **REVIEW-ONLY — no reproducer** | none — `parseSse` is spec-shaped (prefix fields, unknown fields ignored, no `eval`, no prototype sink); `event`/`id` trust is inherited from `cortex-api`, so the residual is endpoint trust, not a parser primitive |
| 24 | Fusion prompt injection (role output → synthesiser/validator) | **NOT ATTACKED** | none — the panel/synthesis injection path (as distinct from gate consent, #21) still needs a pass; surface landed in `a41c76b` mid-review |

#### Fixes landed (kai@openkai, 2026-08-16) — awaiting cole's certification

All six findings are fixed and every reproducer is inverted. Each fix is proved in **both
directions**: with the fixes reverted (source only, tests kept) the suite is **98/106 with
exactly these 8 tests failing**; with the fixes applied it is **106/106**. An inverted test
that passes without the fix proves nothing, so the failing control run is the evidence.

- **F4 (HIGH) — deny-floor blind spot on directory components.** Fixed in
  `permissions.ts: matchesDenyFloor`, which now tests the floor against **every ancestor
  prefix** rather than the full path alone. The original fix direction ("bare-name patterns
  against any path component") would have missed half the finding: `server.pem/privkey` is
  matched by `**/*.pem`, a *slashed* pattern, so the defect is not confined to the bare-name
  branch. "A protected path protects its descendants" covers both cases and is shorter.
- **F6b (HIGH) — the consent surface is spoofable.** Fixed in `tui/permission.ts`: tool name,
  rule, command, cwd, diff path and diff body all pass through `sanitizeTerminalText`.
  Single-line fields are additionally newline-flattened, so a payload cannot fabricate an
  extra line of chrome inside the frame — stripping escapes alone would not have stopped a
  forged `✔ Allow always` line. `REPRO 8` asserts both, plus a control that the overlay's own
  chrome and the real command still render.
- **F5/F5b (MEDIUM) — `edit_file` reads before it checks.** Fixed in `tools.ts`: `guardPath`
  (resolve + floor + containment) runs before `fs.readFile`, and out-of-bounds paths return a
  refusal derived from the path alone. Both probes now return byte-identical text, which the
  inverted reproducers assert by equality rather than by pattern.
- **F6c (MEDIUM) — sanitiser coverage gap.** Fixed in `tui/transcript.ts`: the tool card
  sanitises the name and each arg **key and value** (keys are model-chosen too, which the
  finding did not call out), and `btwBody` sanitises the question.
- **F9 (MEDIUM, latent) — fusion gate consent is fail-open.** Fixed in `fusion/fuse.ts`: the
  guard is `if (checks)` and an absent `approveGate` is a **refusal**, matching the engine's
  "bash can never be auto-allowed" posture. `fusion/gate.ts` now builds the child env through
  `childEnv()`, dropping any variable whose NAME or VALUE is secret-shaped.
- **F7 (MEDIUM) — sessions contradict §4.** Fixed in `persist/session-store.ts` without
  weakening §4: redaction happens at the single JSONL write seam (so messages, custom entries
  and compaction summaries are all covered), and the tree is created `0700`/`0600` with a
  best-effort `chmod` so trees written by older builds are narrowed too. Shared shapes live in
  `core/src/secrets.ts` — one copy, used by both the redactor and the env scrub, because a
  security regex that drifts between call sites is its own defect class.

> **Review-methodology hazard (found while verifying these fixes).** In a git worktree with no
> local `node_modules`, `@openkai/core` resolves *upward* to the main checkout's
> `node_modules/@openkai/core` symlink — which points back into the **main working tree**. Every
> `@openkai/core` import in a worktree test then executes the main checkout's build, so
> core-side changes are silently not under test while CLI-side changes are. This produced a
> false result on the first verification run here. Before certifying, confirm
> `node -e "console.log(require.resolve('@openkai/core', {paths:['packages/cli']}))"` points
> inside the tree under review.

Non-blocking hardening followups (unchanged, not in this fix scope): `walkGrep` labels matches
with `process.cwd()` instead of the tool cwd (wrong/leaky paths); `ShadowGit.undo` containment
is lexical rather than canonical (unreachable today, inconsistent with the `09b56ce` standard);
`grep` compiles a model-supplied `RegExp` (local ReDoS only).

**Gate verdict for v0.01.001: pending cole's re-review (pass 4).** The six blocking findings
are fixed with inverted reproducers and a failing control run; §4 bars the implementer from
certifying their own fixes, so the verdict stays with cole. Row 24 (fusion panel/synthesis
prompt injection) has still **never been attacked** and needs its own pass before release —
it is a review action, not a fix, and remains outside this handoff's scope.

## 3. Deep scans (per release)

Before v1 ships: a full white-box pentest pass (Strix OSS CLI against the repo if the operator provides the model key; otherwise the manual pattern checklist executed by cole end-to-end), plus `fix-security-vulnerabilities` workflow for anything found, plus the CI scanning skill's checklist folded into the release runbook.

## 4. Standing rules

- The security reviewer never reviews their own code (cole reviews kai/bob output; kai reviews cole's).
- Every finding ships with a reproducer — same honesty rule as benchmarks (ADR §5.7).
- **Admissibility rule (2026-08-16, after the fabricated first review):** a security return is only admissible if every claimed reproducer exists on disk and executes. A fabricated security return is a false negative on a safety control — worse than incomplete work. Violations discharge the lane (work is re-done by another agent).
- Secrets live only in `.env` / `local-cortex/.env`; never in Cortex memory, sessions, artifacts, or transcripts.
- Execution is not a sandbox (ADR §5.6) — the permission engine is consent, and the gate review treats it as such.
