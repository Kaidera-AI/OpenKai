# HANDOFF — E019 adversarial review + codecheck (ren@openkai, qwen3.8 pro pass)

**Date:** 2026-08-20 · **From:** ren@openkai (k3) · **To:** ren@openkai (qwen3.8 pro)
**Branch state:** `main` == `release/0.1.007` @ `2618bfc` (worktree `.worktrees/ren-release-0.1.007`)
**Release:** 0.1.9 NOT shipped — held for CTO consent. This pass gates the 0.1.9 cut.
**Gate to reproduce before trusting:** `npm test` = 415/415 · `bash scripts/security-audit.sh` PASSED ·
e2e green (`npx tui-test e2e/{magic-keywords,theme-preview,signin,coverage}` from packages/cli).

## Mission

Full adversarial review + codecheck of everything that landed since your last pass
(the review whose fixes became a1eab24). Attack surface below, freshest code first.
Every finding: file/line, severity, repro. Also CODECHECK the new code itself —
the fixes were written fast and reviewed by nobody.

## Attack surface (newest → oldest)

### 1. Turn aliveness restructure (2618bfc — never reviewed)
- `tui/transcript.ts`: lazy thinking blocks (created on first thinking delta,
  `blocks.splice` mid-list + `reindexOpenTools`), the starburst pulse
  (`tickThinking` driven by the 80ms busy tick), `collapseBoot` (filters boot
  notices mid-list), turn-end settle path. Attack: splice reindexing races with
  tool cards open in the same turn; thinking deltas arriving AFTER text deltas
  (insertion before liveAssistant); the pulse on revealed blocks (Ctrl+O mid-turn);
  collapseBoot during `/btw` or replayed sessions; two submits in one session
  (bootCollapsed latch).
- `tui/app.ts`: turn-end settled row (usage nullability, busySince math),
  the denied-tool operator notice (`denyReasonFromResult` parsing model text).
- `tui/status.ts`: brand-shimmer on ALL busy activity — perf on a 300-char
  activity string at 80ms repaint (paintShimmerLabel is O(n) SGR per frame).
- `tui/magic-keywords.ts` paintShimmerLabel brand palette.

### 2. Click-to-cursor (0b78d37 — never reviewed)
- `tui/mouse-routing.ts`: the vendored-private wrap of pi-tui's
  `handleViewportInput`. Attack: press with no release (pendingClick leak across
  turns); drag replay ordering; clicks while an overlay is open (the rect math
  doesn't know overlays moved the composer); resize mid-gesture (stale
  screenRows); the release handler when the composer height changed between
  press and release; multi-byte/grapheme column mapping; word-wrapped lines
  (the mapping replays render rows — verify against pi-tui's wordWrapLine on
  space-heavy lines).
- `composer.ts positionCursorAt`: private state write (cursorLine/setCursorCol)
  — does the editor's undo stack stay consistent? Cursor marker/paste-token
  interactions (`atomicTokenAt`)? `lastRenderedContentWidth` fallback.

### 3. Mouse guard (e5e2ef5) — `tui/mouse-guard.ts`
Shape-regex coverage: could a legit keystroke sequence match URXVT_MOUSE
(`\x1b[<d+>;<d+>;<d+>M`)? (CSI-with-3-numeric-params ending M — check pi-tui's
keymap for collisions, e.g. modifyOtherKeys or kitty forms ending in M.)
Guard ordering vs pi-tui's viewport listener (registration order assumption —
verify pi-tui dispatches listeners in insertion order, tui.js:562).

### 4. Magic keywords (fc4cb6e) — still attack area 8 from the previous handoff
(docs/HANDOFF_E017_ROUND4.md): boundary regex on emoji/CJK, maskNonProse
adversarial inputs, painter UTF-16 indexing on wide graphemes, the hidden-notice
injection surface, shimmer timer lifecycle across /new /resume.

### 5. Access + denial paths (2618bfc)
- `core/session/tools.ts deniedText` — the remediation text goes to the MODEL;
  check it can't be read as an instruction to escalate (`/autonomy high` is
  operator-only; verify nothing in the tool path lets the model set autonomy).
- The deny-floor tests still hold (audit covers them; re-verify `tools.approval`
  "allow" can't lift the floor).

### 6. Known holes to close or confirm
- **bun channel has ZERO test coverage** (153717c, another session) —
  `upgrade.ts` bun detection + `bun add -g` execution path.
- The npm-channel test previously shelled a REAL `npm install -g` (fixed,
  2618bfc) — audit the rest of upgrade.test.ts for any other un-faked
  runExternal/deps gaps.
- Deferred from round 3 (agree or fix): overlay anchor/minWidth/margin ignored
  in served frames; WsChannel.send backpressure; setTheme("auto") dead branch;
  calibration default-runs producer.

### 7. Round-3 fixes (a1eab24) — regression-verified but only k3-reviewed
ws.ts strict decoder, hub socket/tap/eviction, headless focus/pump/composite,
provider-config canonicalEnvKey, OAuth routing, fuse writeback/consent,
orchestrate thresholds, session-name sanitise. The regression tests pin
contracts; the FIX quality itself wants a second pair of eyes.

## Reference material
- Prior handoff + attack areas 1–7: `docs/HANDOFF_E017_ROUND4.md`
- OMP research (this pass's design source): agents OmpStatusOutput /
  OmpPermissions transcripts — the adoption notes are inline in code comments.
- Epic: `Program/Release_v0.1.009/E019_CONSOLIDATION_TRUST/EPIC_SPEC.md`
- Docs to sanity-check against code: `docs/CAPABILITIES.md`, `docs/TEST_GUIDE.md`
  (claims must match behaviour — that IS a finding class).

## Output
Findings ledger (severity × file/line × repro × suggested fix), a codecheck
verdict per attack area, and a go/no-go for the 0.1.9 cut. The release decision
itself stays with the CTO — present evidence, do not ship.

---

## Addendum (kai@openkai, pre-review gate reproduction, 2026-08-20)

Reproduced on current `main` (3635367):
- `npm test` = **441/441** green.
- `bash scripts/security-audit.sh` = **PASSED**.
- Bun hole (attack-surface §6) is CLOSED on main: `upgrade.test.ts` has
  isBunManaged detection tests (interpreter-under-~/.bun, argv[1] shim, negative)
  plus the executing `bun add -g` branch via injected deps and a failure-path
  test. No real spawn.

e2e caveat (not a regression, do not chase): under `npx tui-test e2e/coverage`,
4 tests fail that PASS under `node --test`:
- `sign-manifest.mjs: signs a manifest the pinned verify path accepts` — needs
  `OPENKAI_RELEASE_PRIVATE_KEY` env; tui-test runs it unset.
- `E002-F2` / `F2 drift guard` / `F2b` — read `scripts/security-audit.sh` via a
  `REPO_ROOT` derived from `import.meta.url`; the resolution differs under the
  tui-test runner. These are harness/env quirks; the same tests are green in
  `npm test` and the audit itself PASSES. CI gates on `npm test`, not tui-test.
