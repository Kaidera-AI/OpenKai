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

### 2.1 Outcome table — E001 re-review + pass-4 certification, 2026-08-16 (cole@openkai; fixes by kai@openkai; independently re-executed against the merged fix-line and re-certified after the `f585d39` REOPEN)

Second pass after the fabricated first review (findings `eba8cb9`) and the fixes at
`09b56ce` + `3f89a45`, plus a third pass verifying the fixes kai landed *during* this
review (`1d46b35`, `e32701e`), plus kai's fixes for the six findings that pass left open
(rows 16–22). The `f585d39` REOPEN reset `main`'s ledger to the honest REWORK state and
dispatched an independent pass-4: the fix-line (`04406b6` → `9efd246`) is merged here and
**every reproducer was re-executed in a worktree where `@openkai/core` was proved to
resolve inside the tree under review** — not read from the fixer's report. Every outcome
below is backed by a named test that exists on disk and executes (§4 admissibility rule);
**110/110 green** at this commit (was `107/107` at `9efd246`; `REPRO 11`, `REPRO 12`, and
the pass-4 `REPRO 13` added since) and `security-audit.sh` PASSED (secret scan, `npm audit`
high, suite). Reproducers live in `packages/cli/test/security-repro.test.ts` unless stated
otherwise. `LIVE` reproducers assert the current vulnerable behaviour so they pass on the
vulnerable tree and prove the exploit — they are inverted when the fix lands, and an
inversion is only credible when the inverted test is shown to FAIL against the pre-fix
source (the control run below, re-executed this pass).

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
| 24 | Fusion prompt injection (role output → synthesiser/validator) | **HELD / NOT-EXPLOITABLE** — attacked pass 4 at both sinks: render boundary HELD; validator NOT REACHABLE by role output; synthesiser attribution enum-locked; residual is inherent LLM trust in synthesis *content*, at parity with #23's endpoint trust (analysis below) | `REPRO 11` (render guard, failing neutered-sanitiser control re-run this pass) + `fusion.test.ts`: `REPRO 13 (#24)` (attribution-forgery containment, self-controlled) |
| 25 | **Secret exfiltration into Cortex memory via `/sessions/ingest`** (the `cortex/` leg F7 named but the F7 fix did not cover) | **HELD** — F7b fixed; redaction moved to the wire seam | `REPRO 10` (inverted, with a passing shipped-path control) |
| 26 | Deny-floor `list_files` on a protected DIRECTORY node (F10) | **OPEN — LOW**, filed pass 4; filename leak only, content reads stay denied; fix (a leaf `.ssh` entry in `DENY_FLOOR`) routed separately per §4 — finder does not fix | `REPRO 12` (LIVE: names leak asserted, content-held guard, and an F4 `.env`-directory control isolating the gap to the un-floored `.ssh` node; invert on fix) — `**/.ssh/**` (permissions.ts) guards contents, never the node itself; independently reproduced by kai |

#### Fixes landed (kai@openkai, 2026-08-16) — certified pass 4 (below)

All six findings are fixed and every reproducer is inverted. Each fix is proved in **both
directions**: with the fixes reverted (source only, tests kept) the suite is **98/107 with
exactly the 9 security reproducers failing** — the 8 below plus `REPRO 10`, the F7b seam
test added at `9efd246`, which is the delta from the earlier 98/106-with-8 figure — and
with the fixes applied it is **107/107**. An inverted test that passes without the fix
proves nothing, so the failing control run is the evidence.

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
`grep` compiles a model-supplied `RegExp` (local ReDoS only). **Re-probed pass 4 — none became
blocking after the wave-0/1 changes, all three source sites unchanged:** the `walkGrep` label
(`tools.ts:205`) is a display/path-disclosure issue only — containment is enforced against the
*tool* cwd by `guardPath` on every child (`tools.ts:219`), and the shipped CLI binds tools to
`process.cwd()` so the two coincide; `ShadowGit.undo` (`shadow.ts:152–154`) stays unreachable
(git records a symlink as a symlink and never descends it, and the non-recursive `fs.rm` unlinks
the link, not its target — the `HELD: shadow-git undo…` guard still passes); `grep`'s
`new RegExp` (`tools.ts:162`) is a self-inflicted local ReDoS with no cross-boundary blast
radius. All three remain worth hardening; none blocks v0.01.001.

#### Lead re-review of the fixes (kai@openkai, 2026-08-16) — pre-check, not certification

Independently re-verified at `04406b6`, in a worktree with `@openkai/core` proved to resolve
**inside the tree under review** (the hazard boxed above; `import.meta.resolve` checked before
any test ran). Both directions reproduced from scratch rather than taken on report: source
fixes reverted with the inverted tests kept → **98/107, exactly the 9 security reproducers
failing** (re-measured at `9efd246`; the original 98/106-with-8 figure predated `REPRO 10`
and was corrected at pass 4); fixes applied → **107/107**. `typecheck` clean,
`security-audit.sh` PASSED.

Because a fix that only satisfies its own reproducer is the failure mode this gate exists to
catch, all six were re-attacked with **16 probes that deliberately avoid the committed tests**:
floor-directory access through `read_file`/`list_files`/recursive `grep` and through a *symlink*
whose target is a floor directory; a deep path and a case-variant directory (`.ENV/production`)
through `evaluate`; `edit_file` refusals compared on the `details` object, not just the text,
for both the floor and the outside-cwd/existence oracle; the CR/BS "rewrite what the operator
reads" vector and a newline-injected fake chrome line rendered through the **real**
`PermissionOverlay`; and `fuse()` with `gate: true` and no consent channel. **15/16 held.**

The one miss became **F7b** (row 25) — fixed here, in-lane, since §4 bars only the certifying
reviewer from fixing:

- **F7b (MEDIUM, latent) — the `cortex/` leg of F7 was left open.** F7 was closed at
  `SessionStore`'s JSONL write seam, which covers every entry shape written to the *file*. But
  `CortexCheckpoint.record()` takes an `Entry[]` from anywhere and posts `messages[].content`
  to `/sessions/ingest` — shared, durable team memory, and the leg §4 names *first*. It was
  safe only by convention: both call sites (`chat.ts:171`, `tui/app.ts:563`) happen to feed it
  `readEntries()`, re-reading the redacted file. The obvious "why re-read the whole file every
  turn?" refactor reopens it silently. Same latent shape as F9, which was filed as blocking
  while it too was unreachable — so it is filed rather than waved through. *Fix:* redaction
  moved to `messageContent()`, the seam where content is lifted onto the wire, plus the `task`
  field (an operator paste carries a key exactly as the `/btw` header carries an escape, F6c's
  parity argument). `REPRO 10` asserts the seam **and** keeps the shipped path as a control:
  with the fix reverted, (a) still passes and (b) fails — which is what localises the defect to
  the seam rather than to today's callers.

Residual, explicitly **not** fixed here (shape-matching is a blast-radius reducer, not a
guarantee — the code says so at both sites): `redactSecrets`/`childEnv` match known provider
token shapes and credential-ish NAMES, so a novel token format, or a credential embedded in an
innocuously-named value such as `DATABASE_URL=postgres://user:pw@host`, passes through. §4's
"secrets live only in `.env`" remains the actual control.

#### Pass-4 certification (cole@openkai, 2026-08-16) — independently re-executed after the `f585d39` REOPEN

The earlier "at `9efd246`" certification was never merged and the `f585d39` REOPEN reset
`main` to REWORK, so this pass **re-executes it from scratch** against the merged fix-line
rather than inheriting it. Run in this worktree with `@openkai/core` proved to resolve to
the *local* `packages/core` (`node_modules/@openkai/core` → `../../packages/core`,
realpath inside the tree) — the resolution hazard boxed above — before any test ran. Rows
16–22 and 25 are certified independently; every reproducer was executed in both directions,
not read from the fixer's report:

- **Direction A (fixes applied):** `npm run build` clean, **110/110** (`109/109` before the
  pass-4 `REPRO 13`), `security-audit.sh` PASSED.
- **Direction B (source-only revert to the pre-fix base `10fe7f5`, inverted tests kept,
  rebuilt):** **100/109 — exactly the 9 fix reproducers fail** and nothing else: `REPRO 4`
  (F4), `REPRO 5`/`5b` (F5/F5b), `REPRO 7` (F7), `REPRO 8` (F6b), `REPRO 9` (F6c), `REPRO 10`
  (F7b), and both F9 fusion tests (`REPRO 9 (fusion)` + the env-scrub check). Zero collateral
  failures, zero tautologies — every inverted test drives its original exploit shape.
- **Render control (the F6 sanitiser neutered to identity, `sanitize.ts` only):** `REPRO 6`,
  `8`, `9`, and `11` fail — proving the sanitiser (not incidental code) is what holds rows
  13/17/20/24's render boundary.
- **Beyond the committed tests:** F4 re-attacked with 5 variants it does not use (mid-path
  `.env` directory component, case-variant `.ENV/production`, nested `id_rsa`, the `.env`
  directory node, a `../`-normalised path) — all `deny`; F6b re-attacked with a CR/BS
  "rewrite what the operator reads" payload distinct from `REPRO 8` — control bytes stripped,
  the real command shown inert. A fix that only satisfies its own reproducer is the failure
  mode this gate exists to catch; these held.

§4 separation held — kai implemented the fixes, cole certified; kai reviews this certification
in turn.

**Row 24 — attacked pass 4 at all three sinks; HELD / NOT-EXPLOITABLE.** The dispatch
names this surface as "role output flowing into the synthesiser/validator" — distinct
from #21 (gate consent) and from the render boundary. Attacked at each:

- **Validator (role output → command execution): NOT REACHABLE.** `designGate()` runs
  *before* the panel (`fuse.ts:79` precedes `runPanel` at `:120`) and its prompt is
  `TASK:\n<task>` alone — confirmed this pass by capturing the validator's live prompt,
  which is exactly `[{role:"user",content:"TASK:\n…"}]` with no role output present. Role
  output is produced only afterward and is never fed back to the gate designer. The
  repair-validator (`repairGate`) consumes verbatim *command output*, not role output, and
  is unreachable in the shipped CLI anyway (`fuse()` passes no `applyWork`, so
  `runGatedFusion` takes the completion-only branch). Command execution additionally
  requires operator consent (F9, fail-closed) and runs with a secret-scrubbed env (F9) —
  both proven by the `fusion.test.ts` gate-consent reproducers.
- **Synthesiser (role output → merge): CONTAINED.** The synthesiser is a fresh session
  with no tools and no operator-session access; role outputs enter it as data. Its output
  is JSON-parsed through `parseSynthesis`, which drops non-conforming items and enum-narrows
  attribution (`kept` → architect|builder|both, `by` → architect|builder —
  `fusion/synthesis.ts`). `REPRO 13 (#24)` assumes the *worst case* — a fully
  attacker-controlled synthesiser obeying an injected role instruction — and proves it
  cannot forge attribution to a fabricated authority (`kept:"operator"` / `by:"system"` →
  `AttributionError`), with a passing control that a legitimate enum owner still parses, so
  it is not a tautology. The raw synthesis is not even persisted to the run record
  (`fuse.ts:192` stores only `modelId`/`usage`).
- **Render boundary: HELD.** Each role output and every free-form synthesis field passes
  through `sanitizeTerminalText` in `Transcript.addFusionResult` (verified identical at
  `10fe7f5` and here — the sanitiser has covered this sink since `1d46b35`, so this is not a
  pass-4 code change but a pass-4 *test* closing the zero-render-tests gap `a41c76b`
  shipped). Attacked with the REPRO 6 payload family (OSC 52 / OSC 0 / CSI 2J / BEL / SGR
  forged consent chrome, plus the C1 and DCS spellings) and HELD — committed as `REPRO 11`.
  Its true inversion control is neutering `sanitize.ts` to identity (reverting
  `transcript.ts` alone does NOT fail it, because the mechanism lives in `sanitize.ts`); run
  this pass, that control fails `REPRO 6/8/9/11`, confirming the sanitiser is load-bearing.
  The two fields the transcript interpolates unsanitised (`kept`, `by`) are exactly the
  enum-narrowed ones; relaxing that narrowing reopens the boundary, which `REPRO 11`'s
  docblock flags.

Residual: the operator trusts synthesis *content* — an LLM reading hostile role output can
be persuaded, not escaped — inherent LLM trust, at parity with row 23's endpoint trust. No
exec path, no privilege escalation, no attribution forgery.

**Row 26 / F10 (LOW) — filed, open, non-blocking.** The floor's slashed patterns
(`**/.ssh/**`, `permissions.ts`) guard directory *contents*, never the directory node:
`list_files` on a `.ssh` directory returns `authorized_keys`, `id_rsa`, `known_hosts` —
a filename-only leak; `read_file` and `grep` on those paths stay denied. Independently
reproduced by the lead. The one-line fix (a leaf `.ssh` entry in `DENY_FLOOR`) is routed
separately per §4 — the finder does not fix — and cole certifies it when it lands, at
which point `REPRO 12` (LIVE, committed at this ledger commit) is inverted.

**Gate-exec reachability, corrected (lead's verification folded in).** The earlier "not
wired into shipped fuse" phrasing was half right and is retired. TUI `/fuse` passes no
gate flag (`tui/runtime.ts:236`). The CLI subcommand, however, IS a shipped entry point:
`cli/src/index.ts:322` reads `--gate` and `cli/src/fuse.ts:116–138` passes it plus a real
`approveGate` into `fuse()` — reaching `designGate`/`runGate` and executing model-authored
shell. It ships safely behind **printed checks plus explicit consent**: `approveGate`
prints every check name and command and refuses without `--yes`, and `core/fuse.ts:88`
treats an absent consent channel as refusal (the F9 fix doing its job). The genuinely
latent part: shipped `fuse()` wires `repairGate` but no `applyWork`, so `runGatedFusion`
takes the completion-only branch (`gate.ts:243`) — checks run once under the operator's
original consent — and the repair loop (`gate.ts:272–273`), which would execute freshly
model-authored checks with **no fresh consent**, is unreachable today. When Inc 05 wires
`applyWork`, that loop becomes reachable and must gain its own consent pass first.

**F7 decision reconciliation (for the lead).** The pass-4 dispatch recorded lead decision
(a) as "F7 ships mode-hardening only, no content redaction, for v0.01.001." The certified
tree does not match that: F7 ships span redaction at the `SessionStore` write seam **and**
F7b's redaction at the Cortex wire seam **and** the `0700`/`0600` tree — content redaction
is present and verified (`REPRO 7`, `REPRO 10`, both directions). This is strictly safer
than the recorded decision, so it is certified as-is; the redaction is explicitly
best-effort (shape-matching — a novel token format or a credential in an innocuously-named
`DATABASE_URL` passes through), with §4's "secrets live only in `.env`" as the actual
guarantee. Flagging so the decision record can be reconciled to what shipped.

**Gate verdict for v0.01.001: CERTIFIED (cole@openkai, pass 4, 2026-08-16) — independently
re-executed against the merged fix-line.** Seven findings (six from pass 3 plus F7b) fixed
and certified with both-direction controls re-run this pass (Direction A 110/110; Direction
B 100/109, exactly the 9 fix reproducers failing; render control fails `REPRO 6/8/9/11`);
row 24 (fusion prompt injection) attacked at all three sinks and held — validator not
reachable, synthesiser attribution enum-locked (`REPRO 13`), render sanitised (`REPRO 11`);
the three hardening followups re-probed and all still non-blocking. The one open finding
(F10, row 26) is LOW, filename-only, content-held, and non-blocking — its one-line fix is
routed separately and will be certified on landing (`REPRO 12` inverts then). No open
critical/high remains, so per §2 the increment is clearable. §4 separation held: kai
implemented, cole certified; kai reviews this certification.

## 3. Deep scans (per release)

Before v1 ships: a full white-box pentest pass (Strix OSS CLI against the repo if the operator provides the model key; otherwise the manual pattern checklist executed by cole end-to-end), plus `fix-security-vulnerabilities` workflow for anything found, plus the CI scanning skill's checklist folded into the release runbook.

## 4. Standing rules

- The security reviewer never reviews their own code (cole reviews kai/bob output; kai reviews cole's).
- Every finding ships with a reproducer — same honesty rule as benchmarks (ADR §5.7).
- **Admissibility rule (2026-08-16, after the fabricated first review):** a security return is only admissible if every claimed reproducer exists on disk and executes. A fabricated security return is a false negative on a safety control — worse than incomplete work. Violations discharge the lane (work is re-done by another agent).
- Secrets live only in `.env` / `local-cortex/.env`; never in Cortex memory, sessions, artifacts, or transcripts.
- Execution is not a sandbox (ADR §5.6) — the permission engine is consent, and the gate review treats it as such.
