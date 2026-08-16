# Inc 09 — TUI parity pack (the "what pi/omp/droid ship out of the box" bar)

**Status:** IN DEVELOPMENT (kai lane) · **Owner:** kai@openkai · **Sprint:** S3 · **Depends:** Inc 03, 05

**Goal:** the TUI meets the minimum competitive bar — what an operator gets out of the box from pi, omp, or droid — before any v1+ release. CTO bar: "at least what pi, omp etc offer right now", droid-grade look and feel. No version bump until the CTO signs off.

## Landed (kai, 2026-08-16)

| Feature | Evidence |
|---|---|
| Slash autocomplete on `/` + `@` file completion | composer wires `CombinedAutocompleteProvider`; tmux-verified popup |
| Provider→model picker (`/model`) | two-level overlay; configured/OAuth state per provider; mid-session switch via `transport.setModel`; live-verified |
| Effort cycle (`/effort [off..high]`) + fast mode (`/fast`) | `transport.setThinkingLevel`; live-verified |
| TUI crash on first turn (stream closed on agent_end) | fixed 0.1.3; multi-turn verified on the release binary |
| Bare-launch flags (`openkai --provider …`) | fixed 0.1.3 |
| Tool-card design (status header, key:value args, unwrapped results) | `a6a17ce` |
| Brand animation (Kaidera mark, once) + compact mark | `a402e1e` |

## Remaining (priority order)

1. **Bash-mode toggle** (`!` with prompt glyph `>`→`$`) — droid pattern.
2. **Double-Esc → rewind menu** (third Esc opens rewind; our undo is command-only).
3. **Model retry** (retry the last turn on a different model — one key).
4. **Autonomy axis chip** (droid: off/low/med/high single-key cycle layered over the permission rules; fixed-width chip in chrome).
5. **Session tree navigation** (`/tree` over the v3 parent links; `/fork` with resume receipt).
6. **Themes** (dark/light at minimum; theme.ts already tokenised).
7. **In-product changelog** (`Ctrl+J`, wired to the upgrade channel's "what changed").
8. **Onboarding first-run flow** (teaches the approval loop; we have the splash, not the teaching).
9. **Mermaid→ASCII inline**, **session search verb** (`openkai search` over sessions + Cortex).
10. **i18n hooks** (post-v1).

## Acceptance

Each item: live-verified via tmux capture + a headless test where the surface allows; 110+ suite stays green; no publish until CTO sign-off.
