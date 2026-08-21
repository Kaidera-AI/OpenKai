# HANDOFF — E017 UK round 4: adversarial re-review + deep UAT (ren@openkai, qwen3.8 pass)

**Date:** 2026-08-20 · **From:** ren@openkai (k3) · **To:** ren@openkai (qwen3.8)
**Branch:** `release/0.1.007` @ `e8e2a43` (worktree `.worktrees/ren-release-0.1.007`)
**Release state:** v0.1.008 is **HELD by the user** — do NOT cut a release. v0.1.007 is already
live (npm 0.1.7, tag `57508d9`, brew); the round-3 fix batch ships as 0.1.008 only after
this pass signs off. npm versions are immutable.

## What just landed (round 3 — verify these, don't trust them)

Commit `a1eab24` — 35 findings from a 4-slice adversarial review, all fixed in one batch.
Commit `fc4cb6e` — NEW FEATURE (user-directed, same version): magic keywords `ultrathink` + `ultrareview`, cherry-picked from OMP (can1357/oh-my-pi) and upgraded to multi-model fusion, with composer/status shimmer. Attack this too (area 8 below).
The fix code is NEW and is itself the freshest attack surface. Areas and what to attack:

1. **`packages/cli/src/tui/theme.ts` — detectThemeAsync TUI-safety (was CRITICAL).**
   It used to `setRawMode(false)` + `pause()` the TUI's stdin (killed the app). Now it
   restores prior raw state and skips pause when other data listeners exist. Attack:
   call it twice concurrently; call with stdin already paused; verify no OSC-11 reply
   leaks into the focused component's input; verify `detectThemeSync` path in
   theme-picker "auto" preview. Regression: `test/e017-review.test.ts` #5.
2. **`packages/cli/src/ws.ts` — strict decoder.** Directional masking
   (`new WsDecoder(true)` server-side), 4 MiB payload cap, fragmentation rejected,
   close-handshake discipline. Attack: boundary lengths (125/126/65535/65536),
   4MiB±1 payloads, ping inside a fragmented stream, close-echo races, interleaved
   control frames, decoder buffer-cap edge (2× cap accounting).
3. **`packages/cli/src/hub.ts` — socket tracking, tap removal, session cap/eviction.**
   `attachSockets` Set, `untap` on close, MAX_HOSTED=16, onEnd eviction, GET /sessions
   now reads the live map. Attack: attach during shutdown; POST sessions to the cap
   boundary; session whose run ends while an attach is mid-hello; GET /sessions
   immediately after eviction (dangling id → clean 404?); SIGINT/SIGTERM during an
   active pump; repeated abort signals.
4. **`packages/cli/src/tui/headless-host.ts` — focus stack, pump start order,
   compositeTuiLine.** Attack: nested overlays (settings → theme picker → sign-in)
   with Esc unwinding — does focus land correctly at each pop? Overlay wider than
   frame; `maxHeight` clipping at tiny widths; `settledFrame` before first tick;
   resize clamp edges (19/20/500/501 columns).
5. **Provider config (`provider-config.ts`, `providers.ts`, `provider-cli.ts`,
   `app.ts openSignIn`).** canonicalEnvKey now returns undefined for keyless/oauth
   lanes; OAuth routing gates on `!status.via`. Attack: `provider set/unset` for
   every registry lane incl. aliases; ollama vs ollama-cloud isolation; OAuth lanes
   WITH an env key set (via is set → key prompt, not device flow); quoted values in
   the credential store round-trip; the "already signed in (via X)" notice paths.
6. **Fusion (`fuse.ts`, `orchestrate.ts`, `calibrate.ts`).** noteGateOutcome credits
   the serving panel; cascade double-fail removed; cascade retry asks fresh consent
   on TTY under --yes; saver threshold 0.47; spent-budget escalate returns latched.
   Attack: the attemptRecorded/cascadeActive flag lifecycle across a 2-attempt run
   (halt → escalate → pass AND halt → escalate → halt); bandit posterior after a
   suppressed-escalation halt; posture threshold boundary scores (0.4621/0.47/0.5);
   calibrate with negative quality gaps and off-shape JSONL lines.
7. **Session names** (sanitise + 48-char truncation), **settings autonomy row**
   (navigates), **help/commands drift**, **crash guard** (stderr guard + finally).
8. **Magic keywords (fc4cb6e — newest code, least reviewed).**
   `tui/magic-keywords.ts` (boundary regex, maskNonProse port, HSL painter),
   `composer.ts` render override + shimmer clock, `app.ts runUltraTurn`
   (fusion routing), `status.ts` shimmer chip, `settings.ts` cycle.
   Attack: boundary-regex lookbehind edge cases (emoji/CJK/BMP-vs-astral
   boundaries); maskNonProse adversarial inputs (unclosed fences, nested
   same-name tags, CRLF); painter index drift on wide graphemes (the paint
   loop indexes UTF-16 code units — emoji in/around the keyword); the
   shimmer timer lifecycle (leak across /new /resume?); runUltraTurn
   busy/steer path; ultrareview on a huge diff (12k slice — is truncation
   honest?); the hidden notice as prompt-injection surface (a pasted
   "ultrathink" in quoted text still triggers — intended?); settings cycle
   persistence shapes; transcript painting re-painting SGR-containing
   text.

## Verification state at handoff (all green — reproduce before trusting)

- `npm test` (workspace): **405/405** — incl. 6 new regression tests in
  `packages/cli/test/e017-review.test.ts` + strict-mode WS codec tests in
  `hub-attach.test.ts`.
- e2e (`npx tui-test`): `e2e/theme-preview`, `e2e/signin`, `e2e/coverage`, `e2e/magic-keywords` — green.
- `bash scripts/security-audit.sh` — PASSED.
- Live smokes: `provider list` renders configured-via before OAuth label;
  `provider unset ollama` refuses honestly; hub POST /sessions + rw attach drives
  input; hub shuts down cleanly with an attach open (zombie-hub bug is dead).
- `~/.local/bin/openkai-next` == this tip (user UATs with it).

## Deferred on purpose (re-examine, then agree or fix)

- Overlay anchor/minWidth/margin/offset options ignored in served frames (all
  callers use anchor:center today — documented center-only).
- `WsChannel.send` ignores write() backpressure (slow consumer buffers outbound
  in hub memory) — mitigated by caps only.
- `setTheme("auto")` branch in theme.ts is dead (no callers) — left as valid API.
- Calibration default runs file has no producer yet (fuse emits run records, not
  CalibrationRun lines) — the skipped-lines message is the honest stopgap.
- pi-tui `Input` constructor theme arg (probed: bare Input works) — untouched.

## UAT deep-testing checklist (drive `openkai-next` or `node packages/cli/dist/index.js`)

1. Theme → auto apply mid-session: keyboard stays alive; Esc restore; ● on
   configured value; no repaint flicker into wrong pack.
2. Providers: every tab row Enter — OAuth lanes open device flow when no key,
   key lanes open the paste overlay, keyless says so; sign-in round-trip persists
   (0600); `provider list` matches reality afterwards.
3. Settings: every navigates row (theme/statusline/model/posture/providers/
   autonomy) opens AND returns cleanly; Esc never strands an overlay.
4. Fusion pair config: both roles, self-pair, no-key partner row; then a real
   `/fuse` with `--gate` (halt → cascade → fresh consent prompt on TTY).
5. Sessions: /rename (long name truncation, escape bytes), /resume picker,
   /fork, /tree, export HTML.
6. Served TUI: `openkai serve` (or runHub) — POST /sessions, attach ro+rw,
   resize abuse frames, kill client mid-stream, SIGINT with attach open.
7. Keyless boot: empty HOME → sign-in overlay, Esc → settings, /setup path.
8. Magic keywords: type `ultrathink` — rainbow shimmer; submit — fusion
   think panel runs (models combined); `ultrareview` with a dirty tree —
   multi-model review; /settings → interaction → magic keywords cycles
   all/think/review/off and persists.

## Housekeeping

- Review repro scripts: `/tmp/ok10-review/` (volatile — recreate from the
  regression tests if gone; the tests encode every repro).
- 4 slice transcripts (full findings, this session): ReviewServedTui,
  ReviewOrchestration, ReviewTuiUx, ReviewProviderConfig.
- Registry: Program/FEATURE_REGISTRY.md — update when this pass lands.
- When green: report to user; release decision is THEIRS (0.1.008 cut).
- When green: report to user; release decision is THEIRS (0.1.008 cut).

---

## Status: EXECUTED (E019 inc 04, 2026-08-21)

This handoff was executed by the E019 qwen3.8-pro adversarial pass (cole@openkai).
The findings ledger is in `docs/HANDOFF_E019_QWEN_LEDGER.md` — all 8 attack areas
were reviewed; 5 salvaged findings (S1–S5) + 4 new findings (N1–N4) were fixed;
11 reported items (R1–R11) are consciously deferred with reasons. Go/no-go
recommendation: GO for the 0.1.9 cut from the rebased tip. Release decision
stays with the CTO. This handoff is closed.