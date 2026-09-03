# E023 — Features integration plan: from ren's research to stitched functionality

**Date:** 2026-09-03 · **Owner:** kai@openkai · **Status:** DRAFT for ren's adversarial
review, then CTO consent · **Scope:** the feature research on file — ren's rounds
(routing/fusion deep dive, TUI design practices + live gap audit, DeepSeek/Cordis
folding plan, the OMP v18 feature table) plus the E023 CTO ports — mapped onto the
fork's existing surfaces. The operator's rule for this plan: **nothing lands as a
"feature tab" or a free-floating command; every item stitches into an existing
surface with one state owner, one renderer, and a gate.**

## 0 · Stitching rules (binding for every row below)

1. **Surface first.** A feature lands in one of: an existing Settings tab *group*
   (never a new tab), an existing slash-command family (`/settings`, `/diff`,
   `/memory`, `/model`, `/fuse`, `/cortex`, `/plan`), a status-line chip, the
   context drawer, or a tool. If none fits, the feature is not ready.
2. **One state owner.** The drawer and the modal render the same diff model; the
   settled indicator reads the turn ledger the transport owns; recall reads the
   Cortex client the settings own. Two owners of one fact is a defect (S1/S3).
3. **Upstream is the functionality guide.** Where omp v18 already ships the
   mechanism (spellcheck, render replay, resize scrollback, TtyWriter, hashline
   fallback, bench dashboard), we **verify and wire**, never rebuild; our work is
   the Kaidera surface and the OpenKai defaults.
4. **Layout is a contract, not a conditional.** Width/height modes are central
   constants; every overlay, hub, and drawer declares which modes it supports.
5. **Capability ladder before colour.** Every rendered surface degrades through
   truecolor → 256 → 16 → `NO_COLOR`/ASCII by the same ladder (`capabilities`),
   and the picker never promises a pixel the terminal cannot paint.
6. **Every row ships with a gate** (golden frame, contract test, or compiled
   drive) and a FEATURE_REGISTRY line; drive-pending rows stay out of the
   changelog.

## 1 · Research → feature inventory

| # | Feature | Source (ren / research) | What the research actually proposes |
|---|---|---|---|
| R1 | Layout modes (compact / narrow / standard / workspace / wide + height modes) | gap audit §5.3 | Central thresholds; one column below 80; optional drawer from 120; prose measure cap 88 |
| R2 | Context drawer (diff / tool detail / plan progress / permission preview) | gap audit §5.2 | One drawer, one toggle (`workspace.context.toggle`), content chosen by the last explicit selection |
| R3 | Diff presentation + navigation (drawer unified, full-screen stacked/side-by-side, wrap toggle, hunk/file nav, explicit rows for binary/renamed/deleted) | gap audit §6 | Same diff model in drawer and modal; controls `j/k`, `n/N`, `]f/[f` |
| R4 | Colour capability ladder + exact Kaidera palette (theme naming = rendered pixels; `NO_COLOR`/16-colour paths) | gap audit §4.2, §7.2–7.4 | Truecolor where available, honest fallbacks, no "mint" label over a cyan default |
| R5 | Settled busy indicator (no spinner flash on fast ops) | gap audit §4.2 | Coalesced start delay; state keyed to a real ledger, not a flag |
| R6 | Served/browser accessibility contract | gap audit §4.2 | xterm.js screen-reader mode + minimum contrast as acceptance criteria for the attach surface |
| R7 | Width-safe Unicode matrix (CJK / combining / emoji) | gap audit §4.2 | One cell-width policy across composer, panes, gutters, chips |
| R8 | Turn enclosure (obligation ledger: open tool calls, pending permissions, queued steers ⇒ "settled" is computed) | DeepSeek folding plan Phase 2 | Transport tracks debt; TUI busy state keys off it |
| R9 | Capability seams (typed service keys for lsp/mcp/memory/fusion; 100-line container) | folding plan Phase 3 | Decision gate for Cordis-or-container |
| R10 | Plugin container + hot reload (plugins.yml, revertible effects) | folding plan Phase 4 | Safe-set hot reload (theme, status, models) |
| R11 | OMP v18 native features: spellcheck, render replay, resizeScrollback, off-thread TtyWriter, hashline sloppy fallback, bench dashboard | E020 parked list + fork-omp evaluation | On the 0.84 line these were folds; on the fork they are upstream — verify, wire, brand |
| R12 | Switchyard operator priorities UI (OK-9.7) + routing ledger visibility | routing/fusion deep dive, OK-9 ADR | Posture/pins/priority editing; tier chip already live |
| R13 | Fusion-first defaults: 2-model pairing across providers, scorer-driven pairing, interactive `/fuse` | deep dive + standing goal 2 | Landed in Inc 03; remaining: pair provenance in settings, self-pair advisory row |
| R14 | CTO ports: `/undo` shadow-git, headless `fuse` CLI + `fusion report/dashboard`, Ctrl+S stash + frecency, `openkai provider` atomic write path, `tail -f` | EPIC_SCOPE "Full functionality upgrades" (PARITY_CENSUS §5) | Port via the openkai layer; retire only on explicit CTO call |
| R15 | Session tree / fork picker, Mermaid render, live task rows, word-diff — census "drive-pending" | PARITY_CENSUS §4 | Promote to tested-and-golden or fix |

## 2 · Integration map — where each feature lives

| # | Surface it stitches into | State owner | Gate |
|---|---|---|---|
| R1 | `modes/layout` central constants consumed by `app` root, hubs, overlays, drawer; **Settings › Appearance › Layout** group gains two rows only: `layout.drawer` (auto/off) and `layout.proseMeasure` (88) | `layout.ts` (one module) | golden frames at 40/60/80/120/160 cols × 12/24/40 rows; no clipping; resize flip-flop drag test (exists for welcome — extend) |
| R2 | The existing `/diff` overlay becomes the drawer's first content; `Ctrl+O`-style toggle registered in **Settings › Interaction › Keybindings**; drawer content selectors are the existing commands (`/diff`, permission overlay "open full diff", `/plan` progress) | a single `DrawerState` in `app` (content + visibility), diff model shared with the modal | drive: open drawer at 120 cols, run a tool, permission preview appears, Esc hides; golden frame per content type |
| R3 | `/diff` (same command, mode-aware) + drawer; controls in the overlay footer; **Settings › Files › Diff** group: `diff.wrap`, `diff.sideBySideMin` (132) | `diff.ts` model (already exists) — renderer gains modes, never a second model | fixtures: unified/stacked/side-by-side goldens; nav key contract test; binary/rename/delete rows test |
| R4 | `theme.ts` capability ladder + **Settings › Appearance › Theme**: existing picker; add `appearance.colorDepth` (auto/truecolor/256/16/none) — one row; the picker label reads the *rendered* palette name | `capabilities.ts` (one ladder), theme JSONs carry both exact hex and 256/16 fallbacks | `NO_COLOR` and `TERM=dumb` goldens; Kaidera dark first-paint pixel test (brand test exists — extend to the ladder) |
| R5 | Status line `state` chip (existing) — delay + ledger-keyed | the turn ledger (R8) | test: sub-200 ms tool call shows no spinner; long call shows it; settled only with zero debt |
| R6 | `docs/attach-protocol.md` + the served host: `screenReaderMode` + `minimumContrastRatio` in the attach handshake; **no settings row** (server contract) | `headless-host` | attach contract test asserts the two options; browser drive with xterm.js |
| R7 | `tui` cell-width helper reused by composer, chips, gutters, panes | one width policy in `packages/tui` | matrix test (CJK/combining/emoji × surfaces) |
| R8 | Transport (`agent-session` turn events) gains the obligation ledger; TUI `state` chip and `✓ settled` row read it | the session transport | kill-the-model-mid-tool test: ledger shows debt; settled never fires with open obligations |
| R9 | `openkai/index.ts` registers capabilities through a tiny container (`register/get/deps/dispose`); `cortex`, `fusion`, `shift`, `served` become the first four entries | `openkai/container.ts` (≤100 lines) | each capability loads/unloads in tests; stubbing `memory` needs zero other changes; Cordis decision recorded at this gate |
| R10 | `~/.openkai/plugins.yml` read by the container; hot reload for theme/status/models only | container + settings hooks | swap theme plugin at runtime without dropping the session |
| R11 | **Verify list** (each = one test + one registry line): spellcheck (Settings › Interaction — upstream row, keep), render replay + resizeScrollback (upstream; golden under resize), TtyWriter (upstream; no surface), hashline sloppy fallback (Settings › Files › Editing — upstream row), bench dashboard (`fusion dashboard` already exists — do **not** add a second dashboard) | upstream | registry lines with the upstream commit that carries each |
| R12 | **Settings › Model › Routing** group (exists as the tier/posture rows): add `shift.priorities` editor rows; `/shift` ledger stays the read surface | `openkai/shift` posture/pins config (config-io) | test: priority edit changes the next routing decision; golden for the group |
| R13 | `/model` and `/fuse` (exist); **Settings › Model › Fusion** group shows the pair + provenance (bandit/diversity/self-pair) | `openkai/pairing` | pairing tests exist (Inc 03); add the settings-row golden |
| R14 | `/undo` (openkai layer, shadow-git) + `undo` CLI; `openkai fuse` headless (`--cast/--gate`) + `fusion report/dashboard`; Ctrl+S stash (Interaction keybinding + `composer` stash); `openkai provider` write path (CLI, KOS contract); `tail -f` (CLI) | each has a 0.1.9 module to port behind the openkai layer | the 0.1.9 test for each, ported; KOS provider contract test |
| R15 | Existing pickers/renderers | as-is | promote to golden or fix; registry rows flip drive-pending → tested |

## 3 · Increments (proposed; consent asks for these inside E023 or as E024)

| Inc | Content | Gate |
|---|---|---|
| 07 — Layout contract + drawer + diff | R1, R2, R3, R7 | goldens across the mode matrix; drawer drive; diff nav contract |
| 08 — Ledger + capability ladder | R8, R5, R4 | mid-tool kill test; NO_COLOR/16 goldens; first-paint pixel test |
| 09 — CTO ports + routing UI | R14, R12, R13 (settings rows), R15 promotions | ported 0.1.9 tests; routing golden; registry 100% dispositioned |
| 10 — Upstream verify + served a11y | R11 (verify list), R6 | registry lines with upstream commits; attach contract test |
| 0.1.13 — Seams + plugins | R9, R10 | container tests; hot-reload drive; Cordis decision recorded |

Each increment: FEATURE_REGISTRY rows first (what will exist), gate second, code
third — so the census never drifts from the tree again.

## 4 · Explicitly not built

- A "features" tab, a "labs" tab, or a settings group per research doc.
- A second diff renderer, a second dashboard, a second busy flag.
- Rebuilding anything omp v18 already ships (R11 list) — verify and brand only.
- Cordis as a dependency before the R9 gate.
- Hosted Cortex (parked, v0.1.13 review) and voice/PTT (transferred to KOS).

## 5 · Questions for ren's review

1. R2/R3: is one drawer with content selection the right call over a
   persistent split at ≥160 columns? (Design says drawer; argue if wrong.)
2. R4: is `appearance.colorDepth` a row the operator should ever touch, or should
   the ladder be purely detected (+ `NO_COLOR`)? Default proposal: detected, row
   exists for overrides only.
3. R8: does the obligation ledger belong in the transport (proposal) or the
   session controller? The busy chip and the served `state` frame both read it.
4. R14: `tail -f` — port or retire (Cortex/collab coverage exists)? Default: port.
5. Ordering: Inc 07 before 08 keeps the visible win first; 08 before 07 makes the
   drawer's busy state honest from day one. Recommendation wanted.
