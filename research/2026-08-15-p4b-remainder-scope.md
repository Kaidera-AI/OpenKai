# P4b-remainder Scope — TUI ergonomics wave 2 (Inc 05 completion)

**Date:** 2026-08-15 · **Author:** kai@openkai · **Epic:** E001 Inc 05 · **Owner:** bob@openkai
**Builds on:** main @ `382c430`+ (P4a shell merged; P4b permission engine + protocol v2 merged; shadow-git undo core merged with `InProcessTransport.undoLastMutation()`)

## 1. What this slice is

The remaining omp-grade/droid-bar TUI features from ADR OK-5, all TUI-surface (`packages/cli/src/tui/` + theme tokens). The permission engine, protocol v2, and shadow-git undo core are DONE — do not rebuild them.

1. **Attention notifications** (opencode floor + droid two-channel refinement): focus-aware — when the terminal lacks focus and a turn ends or a permission request lands, emit a terminal bell + OSC 9/777 notification where supported; quiet when focused. One theme-token colour for the attention state in the chrome.
2. **Per-agent visual identity** (bob's visibility research + droid): each role/persona gets a stable token-colour + short pill label rendered on its transcript blocks and in the chrome (`[ARCHITECT]`, `[BUILDER]`, `kai`, …). Colours come from theme.ts only.
3. **Leader-key namespace + command palette + which-key** (opencode floor): `Ctrl+K` (or configured leader) opens the palette overlay listing every command with fuzzy filter (pi-tui `fuzzyMatch`/`SelectList`); typing shows which-key hints. Palette carries the canonical footer grammar.
4. **Prompt stash + frecency history** (opencode floor): `Ctrl+S` stashes the current draft (stack, pop with `Ctrl+S` on empty composer); history recall ranks by frecency (frequency + recency score) — persist history+frecency under `.openkai/` (local state, gitignored).
5. **`/btw` side channel** (droid): `/btw <text>` asks a clarifying side question in an overlay without polluting the main transcript (the answer arrives as a system-marked block, not a user turn).
6. **`/undo` surface**: wire `InProcessTransport.undoLastMutation()` into the TUI (command + palette entry), rendering the restored sha in the transcript as a system block.

## 2. Hard rules (unchanged bars)

- theme.ts tokens remain the ONLY colour source; new states (attention, role pills) add tokens, never literals.
- Every overlay carries the canonical footer `↑/↓ Navigate · Enter Select · ESC Cancel`.
- Clean-by-default: none of these features may add always-on chrome noise; attention state lives in the status line.
- No new runtime dependency. frecency is arithmetic, not a library.

## 3. Verification

- `npm run build && npm run typecheck && npm test` green; extend the existing golden-frame/event-mapping tests: palette overlay frame carries the footer; attention state renders in chrome; frecency ordering unit test (pure function); stash push/pop test.
- Frecency + stash logic are pure functions — test them without the TUI.
- Return with: build/test output, the new token list, one captured frame showing the palette overlay.

## 4. Explicitly not here

Subagent tree navigation (needs P3 fusion panels in TUI — later); mermaid→ASCII; onboarding flow; in-product changelog. Protocol stays v2 — no new approval semantics.
