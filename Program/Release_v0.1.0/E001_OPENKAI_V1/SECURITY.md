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

### 2.1 Outcome table — E001 re-review, 2026-08-16 (cole@openkai, tip `e32701e`)

Second pass after the fabricated first review (findings `eba8cb9`) and the fixes at
`09b56ce` + `3f89a45`, plus a third pass verifying the fixes kai landed *during* this
review (`1d46b35`, `e32701e`). Every outcome below is backed by a named test that exists
on disk and executes (§4 admissibility rule); **105/105 green** and `security-audit.sh`
PASSED at `e32701e`. Reproducers live in `packages/cli/test/security-repro.test.ts` unless
stated otherwise. `LIVE` reproducers assert the current vulnerable behaviour so they pass
now and prove the exploit — they are inverted when the fix lands, exactly as REPRO 1–3 and
REPRO 6 were.

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
| 16 | **Deny-floor blind spot: protected name as a DIRECTORY component** | **LIVE — HIGH** (F4) | `REPRO 4` |
| 17 | **Consent surface (`PermissionOverlay`) renders model-supplied escapes** | **LIVE — HIGH** (F6b) | `REPRO 8` |
| 18 | **`edit_file` pre-gate read = content oracle over floor files** | **LIVE — MEDIUM** (F5) | `REPRO 5` |
| 19 | **`edit_file` pre-gate read = content/existence oracle outside cwd** | **LIVE — MEDIUM** (F5b) | `REPRO 5b` |
| 20 | **Sanitiser residue: `tool_call` name/args + `/btw` header** | **LIVE — MEDIUM** (F6c) | `REPRO 9` |
| 21 | **Fusion gate consent is fail-open (absent `approveGate` = approved)** | **LIVE — MEDIUM** (F9, latent) | `fusion.test.ts`: `REPRO 9 (fusion)` |
| 22 | **Secret exfiltration into sessions (verbatim + world-readable mode)** | **LIVE — MEDIUM** (F7) | `REPRO 7` |
| 23 | SSE frame injection / cursor forgery | **REVIEW-ONLY — no reproducer** | none — `parseSse` is spec-shaped (prefix fields, unknown fields ignored, no `eval`, no prototype sink); `event`/`id` trust is inherited from `cortex-api`, so the residual is endpoint trust, not a parser primitive |
| 24 | Fusion prompt injection (role output → synthesiser/validator) | **NOT ATTACKED** | none — the panel/synthesis injection path (as distinct from gate consent, #21) still needs a pass; surface landed in `a41c76b` mid-review |

#### Open findings (blocking, filed to kai@openkai — §4 bars cole from fixing what cole must certify)

- **F4 (HIGH) — deny-floor blind spot on directory components.** `pathGlobMatch` tests a
  bare-name pattern against the whole relpath or the *basename* only, so `.env/production`
  (basename `production`) misses the `.env` floor: `evaluate` returns `allow` and `read_file`
  hands back `DB_PASSWORD=…` with no prompt. Same hole for `server.pem/privkey`. Slashed
  patterns such as `**/.ssh/**` are unaffected, which localises the defect to the bare-name
  branch. *Fix direction:* match bare-name floor patterns against **any path component**.
- **F6b (HIGH) — the consent surface is spoofable.** `PermissionOverlay` renders the bash
  command preview, diff path, diff body and tool name verbatim, so a hostile model can blank
  the frame (CSI 2J), forge approval chrome (SGR), or rewrite the command the operator reads
  while a different one is approved (CR/BS). ADR §5.6 makes the permission engine *the*
  control; if consent can be spoofed the control is gone — hence HIGH, above the F6 class it
  belongs to. *Fix direction:* route every overlay field through `sanitizeTerminalText`.
- **F5 (MEDIUM) — `edit_file` reads before it checks.** `fs.readFile(abs)` +
  `countOccurrences` run before `gate.request`, so the reply distinguishes a correct guess
  ("Permission denied") from a wrong one ("oldString not found") and the ambiguous branch
  leaks a match count — a confirmed-guess oracle over floor files and outside-cwd paths, with
  no `permission_request` ever emitted for the operator to see. Integrity holds; only
  confidentiality leaks. *Fix direction:* resolve + floor/containment check **before** any read.
- **F6c (MEDIUM) — sanitiser coverage gap.** `1d46b35` is sound where applied, but the tool
  card renders the model-chosen tool NAME and top-level ARG VALUES unsanitised, reinstating
  the F6 channel on every tool call; the `/btw` question header is also raw while
  `addUserMessage` is sanitised. *Fix direction:* sanitise the tool-card name/args and the btw
  header.
- **F9 (MEDIUM, latent) — fusion gate consent is fail-open.** The guard is
  `if (checks && options.approveGate)`, so a caller that designs a gate but omits the callback
  executes model-authored shell through `spawnSync(…, { shell: true, env: { ...process.env } })`
  — inheriting every secret the CLI loaded from `.env`. Only `src/fuse.ts` wires consent; the
  TUI's `/fuse` does not and is safe today ONLY because it never sets `gate: true`. *Fix
  direction:* refuse when checks exist and no consent channel is supplied (fail closed), and
  scrub secret-shaped variables from the child environment.
- **F7 (MEDIUM) — sessions contradict §4.** No redaction exists in `persist/` or `cortex/`,
  and the session tree is created with default modes, so an approved `bash cat .env`
  (legitimate under ADR §5.6) writes secret material verbatim into a group/other-readable
  file. *Fix direction:* create the tree `0700`/`0600`, and either redact secret-shaped spans
  on write or amend §4 to state the rule is operator-responsibility.

Non-blocking hardening followups: `walkGrep` labels matches with `process.cwd()` instead of the
tool cwd (wrong/leaky paths); `ShadowGit.undo` containment is lexical rather than canonical
(unreachable today, inconsistent with the `09b56ce` standard); `grep` compiles a
model-supplied `RegExp` (local ReDoS only).

**Gate verdict for v0.01.001: REWORK — not cleared.** Two HIGH (F4 silent secret disclosure,
F6b spoofable consent) plus four MEDIUM. Findings 1–3 from the first pass are genuinely fixed
and regression-guarded, `1d46b35`/`e32701e` are verified real (not asserted), and the fusion
panel/synthesis injection path (#24) still needs its own pass before release.

## 3. Deep scans (per release)

Before v1 ships: a full white-box pentest pass (Strix OSS CLI against the repo if the operator provides the model key; otherwise the manual pattern checklist executed by cole end-to-end), plus `fix-security-vulnerabilities` workflow for anything found, plus the CI scanning skill's checklist folded into the release runbook.

## 4. Standing rules

- The security reviewer never reviews their own code (cole reviews kai/bob output; kai reviews cole's).
- Every finding ships with a reproducer — same honesty rule as benchmarks (ADR §5.7).
- **Admissibility rule (2026-08-16, after the fabricated first review):** a security return is only admissible if every claimed reproducer exists on disk and executes. A fabricated security return is a false negative on a safety control — worse than incomplete work. Violations discharge the lane (work is re-done by another agent).
- Secrets live only in `.env` / `local-cortex/.env`; never in Cortex memory, sessions, artifacts, or transcripts.
- Execution is not a sandbox (ADR §5.6) — the permission engine is consent, and the gate review treats it as such.
