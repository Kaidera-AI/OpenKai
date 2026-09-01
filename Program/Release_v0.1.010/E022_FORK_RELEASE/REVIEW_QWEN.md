# E022 INC 06 — REVIEW_QWEN (qwen3.8 pro adversarial pass 3 of 3)

**Date:** 2026-09-01 · **Reviewer:** QwenSecUat (security re-read + UAT)
**Diff reviewed:** `git diff fac84d626d..HEAD` in `~/DevVault/openkai-fork`,
branch `e022/inc-00-04-tui-consolidation`.
**HEAD at sign-off:** `312e11fe52` ("E022 Inc 06 (ren adversarial): fix six
findings + product version surfaces"). Note: the HEAD moved during the review
(`6ed7de4889` → `312e11fe52`); every live probe below states which head it ran
against, and the final verdict is against `312e11fe52`.
**Method:** static re-read of the openkai layer + sdk.ts + cli-commands.ts +
setup-system-deps action; live PTY/print-mode drives of the source-built fork
(`bun src/cli.ts`); bypass probes scripted against `gate-floor.ts`; suite runs
on the fork's own test harness. READ-ONLY on the fork (no edits, no commits).
**Non-goals honoured:** browser tooling; upstream-outside-diff. The known
carried `browser-tab-worker-startup` visible-tab failure is NOT re-reported.

---

## 1. Findings

| ID | Severity | file:line | Confidence |
|---|---|---|---|
| QW-01 | major (functional; contract-integrity) | `src/openkai/fusion/telemetry.ts:54` + `src/openkai/fusion-tool.ts:173` | high |
| QW-02 | high — **found at `6ed7de4889`, FIXED at `312e11fe52`, re-verified** | `src/openkai/gate-floor.ts:142-147` (old) | high |
| QW-03 | minor | `src/openkai/upgrade-trust.ts:40` + `scripts/compile-binary.ts:41-50` | high |
| QW-04 | informational | `src/openkai/floor-extension.ts:15` | high |

### QW-01 — the fusion telemetry redaction boundary has no writer (dead seam)

`telemetry.ts` ships `recordFusionRun()` (local append to
`.openkai/fusion/runs.jsonl`, redacted) and `exportFusionRunArtifact()` (Cortex
artifact export, redacted) — and a repo-wide grep proves **neither has any
caller** outside its own module: `fuse()` builds the `FusionRunRecord` and
returns it, `fusion-tool.ts` calls `fuse()` (line 173) and discards
`result.record`. Consequences, all proven live (fusion run driven in
`--print` mode, session `01a05ccc-bbfe-7000`):

1. No `runs.jsonl` is ever written — confirmed absent in the drive's cwd after
   a completed, divergent, verification-child run.
2. The bandit (`fusion-tool.ts:125`) reads an always-empty log:
   `bandit.update(await readFusionRuns(...))` learns nothing, so the Inc 03
   scorer-source contract's bandit branch is permanently cold — every default
   pair resolves via cross-provider diversity or self-pair advisory, never
   bandit evidence. The pairing gates pass because they test the scorer's
   *logic*, not its *signal supply*.
3. In managed mode the Cortex artifact export never fires — the "telemetry
   rides Cortex" census row (PARITY_CENSUS §2) has no live path.
4. Security angle (why it is in this document): the module's documented
   contract — "two boundaries are redacted before anything leaves the
   process" — is currently unenforceable/unverifiable in production, because
   the boundary never fires. There is **no live leak today** (nothing writes
   an unredacted copy either); the risk is the inverse — a future writer added
   without the redaction call would leak silently, and nothing in the shipped
   tree exercises the sanitised path end-to-end.

**Repro:** run any fusion (`/fuse` or the fusion tool), then
`find <cwd> -name runs.jsonl` → nothing; grep `recordFusionRun(` across
`packages/` → only the definition + re-export.
**Fix:** call `recordFusionRun(result.record)` (and, when
`cortexManaged()`, `exportFusionRunArtifact`) in `fusion-tool.ts` after a
successful `fuse()`; or formally retire the seam and delete the dead exports
+ the bandit read. Either is a one-line-ish decision; shipping as-is makes the
documented security contract fiction.

### QW-02 — TMPDIR env disables deny-by-containment (found live; fixed in-commit; re-verified)

At `6ed7de4889` (the HEAD when this pass started), `outsideCwd()` exempted
ANY canonical path under `os.tmpdir()` — and `os.tmpdir()` is env-controlled
(TMPDIR/TMP/TEMP). Proven exploit (`/var/folders/.../qwen-tmpdir/tmpdir-probe.ts`,
run against the HEAD version of `gate-floor.ts`):

```
TMPDIR=/Users/amadmalik bun tmpdir-probe.ts
outsideCwd(cwd, /Users/amadmalik/.config/settings.json) => false
outsideCwd(cwd, /Users/amadmalik/Documents/notes.md)    => false
outsideCwd(cwd, /Users/amadmalik/.ssh/id_ed25519)       => false
```

i.e. with `TMPDIR=$HOME`, containment died for the whole session — every path
in the operator's tree read as "inside". The DENY_FLOOR secret globs still
fired (`.ssh` stayed denied via `floorMatchFor`), so the blast radius was
non-floor paths only, but containment is half the floor's guarantee.

**Status: FIXED** — `312e11fe52` (ren's REN-04) gates the exemption behind
`tmpExemptionApplies()`: the resolved temp root must be a genuine platform
temp root and never the operator's home (or an ancestor of it). Re-proven on
the final HEAD with the identical probe:

```
outsideCwd(cwd, /Users/amadmalik/.config/settings.json) => true
outsideCwd(cwd, /Users/amadmalik/Documents/notes.md)    => true
outsideCwd(cwd, /Users/amadmalik/.ssh/id_ed25519)       => true
```

Regression tests added (`openkai-floor.test.ts` +27 lines; the floor suite is
green in the final run). Recording here so the disposition chain is complete.

### QW-03 — the Ed25519 trust root ships unpinned (witness = SHA-256 + GitHub transport only)

`BUILD_RELEASE_KEY` is undefined: `compile-binary.ts`'s defines stamp
`OPENKAI_BUILD_CHANNEL=standalone` but no `OPENKAI_RELEASE_KEY`, so every
shipped standalone binary runs `UpdateWitness` without a pinned key —
`verifyManifest()` returns early and the upgrade trusts GitHub release
transport + the SHA-256 artifact witness only (the command prints the warning
honestly: "no release key pinned — manifest signatures are NOT verified").
This is documented design ("Unpinned → signature opt-in; SHA witness still
gates") and fail-closed behaviour when pinned is gate-proven (16/16
upgrade-trust tests + the 2 REN additions). **Action before the standalone
channel publishes:** generate the release keypair, pin the public key via the
`OPENKAI_RELEASE_KEY` build define (private key stays out of the tree — the
`~/.openkai/release-private.pem` seen on this workstation must never be
committed), and re-prove the signed round-trip at the cut.

### QW-04 — the floor inspects structured path args only; bash redirection rides upstream approval (informational)

`floor-extension.ts` checks `PATH_ARG_KEYS` (`path/file/filePath/target/
targetPath/outputPath`); the bash tool's `command` string is not path-parsed,
so `echo x > .env` in a bash call is gated by upstream's approval overlay,
not the floor. This is the ported invariant (0.84 line identical), the DOGFOOD
row is proven via the write tool's path argument, and no diff hunk changed it
— recorded so nobody reads the floor as a shell-sandbox. No action.

---

## 2. Equivalence suite + the novel bypass attempt

**Suite (final HEAD `312e11fe52`):**
`bun test openkai-security-equivalence.test.ts openkai-floor.test.ts
openkai-upgrade-trust.test.ts openkai-fusion-pairing.test.ts` →
**45 pass / 0 fail** (equivalence 10/10 confirmed; floor 3/3 + the REN-04
regressions; upgrade-trust 18; pairing 14). The 10/10 + floor-green
acceptance is met — and met again on the final head.

**Novel bypass attempt (one beyond the suite's payloads; several recorded):**

| Vector | Outcome |
|---|---|
| **TMPDIR env poisoning** (the chosen novel vector — procenv/tier class) | **BYPASS at `6ed7de4889`** (see QW-02); fixed in `312e11fe52`, probe re-run green |
| symlink farm: `data/link-ssh → ~/.ssh`, `data/link-passwd → /etc/passwd`, `data/link-config → ~/.config` | blocked: `resolveCanonical` walks the link; `link-ssh`, `link-ssh/id_ed25519`, `link-ssh/authorized_keys`, `link-ssh/new_key` all hit `**/.ssh`; `/etc/passwd` hits containment. Only `link-config` passes the floor (`.config` is not a floor node — by design) |
| cwd-in-temp + link escaping to `~/.ssh` | blocked both ways (`outsideCwd=true`, floor `**/.ssh`) |
| temp-prefix sibling confusion (`$TMPDIR"X/file.txt"`) | blocked (`outsideCwd=true` — the separator-boundary compare is correct) |
| case/unicode/dot-segment games (`.ENV`, `.Env/production`, `.SSH/authorized_keys`, `.env/`, `./.env`, `sub//.env`, backslash) | all blocked (NFC+lowercase normalisation + ancestor walk) |
| near-misses `.envbackup`, `env.local`, `.git/hooks/pre-commit`, `credentials.txt` | pass the floor by design (shape ceiling, documented); containment + upstream approval still apply |

The TMPDIR vector was the only genuine containment bypass found; it is closed
and regression-pinned on the final head.

---

## 3. UAT — DOGFOOD_FORK parity checklist (fork column; 0.1.9 column not drivable here)

Drives ran against the source-built fork (`bun packages/coding-agent/src/cli.ts`
at the then-HEAD; final re-drive at `312e11fe52`). The installed
`~/.local/bin/openkai-next-fork` binary (25 Aug) predates Inc 03–05 (strings
census: no upgrade/witness/fusion-pair markers) and was NOT used for UAT.
Auth context: real provider creds in `~/.pi/agent/auth.json` (fireworks key +
OAuth), zero creds in the isolated `OPENKAI_HOME`.

| Surface | Fork (omp base) | Evidence |
|---|---|---|
| Boot + brand | **PASS** | fresh `OPENKAI_HOME`, zero creds → composer reached ("Welcome back!"); title `OpenKai v0.1.10 · engine 18.0.11`; mint `#B0E1CD` truecolor present in the raw frame (38;2;176;225;205); Kaidera hex-node mark on first paint; schema defaults `kaidera-dark`/`kaidera-light` (settings-schema.ts:683/695); `--version` prints `openkai/0.1.10` |
| Turn aliveness | **PASS** | print-mode turn answered in ~8s (`--print -p 'Reply with exactly one word: OK'` → OK); TUI PTY turn rendered composer + welcome card |
| Tool cards (live states) | **PASS** | write tool dispatched then floor-blocked; fusion tool card recorded `[architect · k3] 27661ms` / `[builder · k3] 25090ms` in the session jsonl details |
| Composer | **PARTIAL** | prompt entry + submit proven in the PTY drive; history/paste/images not driven |
| Permissions UX | **PASS** | absolute refusal, no prompt: session jsonl carries `openkai deny floor: .env matches protected path ".env" — refused absolutely (never prompted)`; the model (k3) also refused to route around it via shell redirection |
| Fusion verdicts | **PASS** | live panel run: 2 roles k3+k3, consensus 9, divergences 3, gate `not-run` (ungated run), verification child admitted on divergence (`mtilun96-1`, gen 1) with the pending/collect seam; pair provenance honest (single provider → no bandit/diversity source surfaced). Caveat: see QW-01 — no telemetry record persisted |
| Tier routing visibility | **PARTIAL** | shift gates green (the shift suite is in the 41-test gate run); extension wires `setStatus("openkai-tier", "t:cap|t:eff")` on flips; no live flip observed in the 45s drive (needs a repeated-error task) — gate-verified, flip not driven |
| Deny floor honesty | **PASS** | refusal names the pattern (§1 evidence); novel bypass matrix in §2 all-blocked on the final head; the one bypass found was fixed during review |
| Sessions (resume/fork/tree) | **PASS (resume)** | boot in a session-bearing dir lists the 3 UAT sessions with timeAgo in the Recent sessions panel; `--session`/`--session-dir` present in flag-tables; fork/tree not driven |
| Speed / memory feel | **PASS (impressionistic)** | boot <1s to composer; no 0.1.9-line binary comparison available (openkai-next is the stale 23 Aug build) |
| Crash record | **PASS on final head** | one historical exception: capture #2 (pre-Inc-06 commit, dirty working tree) hit `Cannot find module '../../openkai/brand' from splash.ts` at splash time; `312e11fe52` fixed the import to `../../../openkai/brand` and stamps the splash version — final boot capture is clean and the splash module imports standalone |
| Cortex memory (managed mode) | **PASS (seam) / ENV-blocked** | `CORTEX_PROJECT=openkai` run: cortex_record registered, called the API, reported the honest 404 (`POST /learnings` 404 — the openkai project is unregistered in the shared registry; operator action per INC_05, environmental not code) |

**UAT residue:** sessions/captures live under `$TMPDIR/qwen-uat*` and
`~/.omp/agent/sessions/-tmp-qwen-uat-*` (3 sessions). One canary
(`sk-qwenUat…`) was placed in a fusion prompt to audit leak paths: it appears
ONLY in the user's own input message in the session jsonl (the operator's own
transcript — expected); it did not reach the fusion tool call (the model
stripped it), the tool result, or any telemetry/artifact surface.

---

## Verdict

**Ship-conditional PASS at `312e11fe52`: no blocker; the one genuine bypass
(TMPDIR containment) was proven live and is already fixed + regression-pinned
on this head; the standing major is QW-01 (dead fusion-telemetry writer — a
contract/functional gap, not a live leak) which needs a one-line wiring or a
formal retire before the bandit-pairing and Cortex-telemetry claims can be
trusted; pin the release key (QW-03) before the standalone channel publishes.**
