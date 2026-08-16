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

### 2.1 Outcome table — E001 re-review, 2026-08-16 (cole@openkai, tip `a41c76b`)

Second pass after the fabricated first review (findings `eba8cb9`) and the fixes at
`09b56ce` + `3f89a45`. Every outcome below is backed by a named test in
`packages/cli/test/security-repro.test.ts` that exists on disk and executes
(§4 admissibility rule); 100/100 green at `a41c76b`. `LIVE` reproducers assert the
current vulnerable behaviour so they pass now and prove the exploit — they are
inverted when the fix lands, exactly as REPRO 1–3 were.

| # | Attack class | Outcome | Reproducer (`security-repro.test.ts`) |
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
| 13 | **Deny-floor blind spot: protected name as a DIRECTORY component** | **LIVE — HIGH** (F4) | `REPRO 4` |
| 14 | **`edit_file` pre-gate read = content oracle over floor files** | **LIVE — MEDIUM** (F5) | `REPRO 5` |
| 15 | **`edit_file` pre-gate read = content/existence oracle outside cwd** | **LIVE — MEDIUM** (F5b) | `REPRO 5b` |
| 16 | **ANSI/OSC escape injection from model output into the terminal** | **LIVE — MEDIUM** (F6) | `REPRO 6` |
| 17 | **Secret exfiltration into sessions (verbatim + world-readable mode)** | **LIVE — MEDIUM** (F7) | `REPRO 7` |
| 18 | Upgrade/packaging supply chain (unsigned channel, digest mismatch, channel pin) | **HELD** — negative paths tested | `upgrade.test.ts`: witness sha256 mismatch refused; unsigned manifest refused when a key is pinned; `OPENKAI_CHANNEL` never overwrites `process.execPath` |
| 19 | SSE frame injection / cursor forgery | **REVIEW-ONLY — no reproducer** | none — `parseSse` is spec-shaped (prefix fields, unknown fields ignored, no `eval`, no prototype sink); `event`/`id` trust is inherited from `cortex-api`, so the residual is endpoint trust, not a parser primitive |
| 20 | Fusion prompt injection (role output → synthesiser/validator; gate command injection) | **NOT REVIEWED** | none — surface landed in `a41c76b` (OK-7) *during* this pass; requires its own §2 gate before release |

#### Open findings (blocking, filed to kai@openkai — owner of `permissions.ts` / `tools.ts`)

- **F4 (HIGH) — deny-floor blind spot on directory components.** `pathGlobMatch` tests a
  bare-name pattern against the whole relpath or the *basename* only, so `.env/production`
  (basename `production`) misses the `.env` floor: `evaluate` returns `allow` and `read_file`
  hands back `DB_PASSWORD=…` with no prompt. Same hole for `server.pem/privkey`. Slashed
  patterns such as `**/.ssh/**` are unaffected, which localises the defect to the bare-name
  branch. *Fix direction:* match bare-name floor patterns against **any path component**.
- **F5 (MEDIUM) — `edit_file` reads before it checks.** `fs.readFile(abs)` +
  `countOccurrences` run before `gate.request`, so the reply distinguishes a correct guess
  ("Permission denied") from a wrong one ("oldString not found") and the ambiguous branch
  leaks a match count — a confirmed-guess oracle over floor files and outside-cwd paths, with
  no `permission_request` ever emitted for the operator to see. Integrity holds; only
  confidentiality leaks. *Fix direction:* resolve + floor/containment check **before** any read.
- **F6 (MEDIUM) — model output drives the terminal.** Transcript deltas are appended
  unfiltered, so a hostile turn emits OSC 52 (clipboard write), OSC 0 (title rewrite),
  CSI 2J (screen clear, erasing evidence) and can forge the green `✔ Allow always — approved
  by operator` chrome that the consent model depends on. *Fix direction:* neutralise C0/CSI/OSC
  sequences in model text before it reaches a component.
- **F7 (MEDIUM) — sessions contradict §4.** No redaction exists in `persist/` or `cortex/`,
  and the session tree is created with default modes, so an approved `bash cat .env`
  (legitimate under ADR §5.6) writes secret material verbatim into a group/other-readable
  file. *Fix direction:* create the tree `0700`/`0600`, and either redact secret-shaped spans
  on write or amend §4 to state the rule is operator-responsibility.

Non-blocking hardening followups: `walkGrep` labels matches with `process.cwd()` instead of the
tool cwd (wrong/leaky paths); `ShadowGit.undo` containment is lexical rather than canonical
(unreachable today, inconsistent with the `09b56ce` standard); `grep` compiles a
model-supplied `RegExp` (local ReDoS only).

**Gate verdict for v0.01.001: REWORK — not cleared.** One HIGH silent secret-disclosure (F4)
plus three MEDIUMs, and the fusion surface from `a41c76b` is unreviewed. Findings 1–3 from the
first pass are genuinely fixed and now regression-guarded.

## 3. Deep scans (per release)

Before v1 ships: a full white-box pentest pass (Strix OSS CLI against the repo if the operator provides the model key; otherwise the manual pattern checklist executed by cole end-to-end), plus `fix-security-vulnerabilities` workflow for anything found, plus the CI scanning skill's checklist folded into the release runbook.

## 4. Standing rules

- The security reviewer never reviews their own code (cole reviews kai/bob output; kai reviews cole's).
- Every finding ships with a reproducer — same honesty rule as benchmarks (ADR §5.7).
- **Admissibility rule (2026-08-16, after the fabricated first review):** a security return is only admissible if every claimed reproducer exists on disk and executes. A fabricated security return is a false negative on a safety control — worse than incomplete work. Violations discharge the lane (work is re-done by another agent).
- Secrets live only in `.env` / `local-cortex/.env`; never in Cortex memory, sessions, artifacts, or transcripts.
- Execution is not a sandbox (ADR §5.6) — the permission engine is consent, and the gate review treats it as such.
