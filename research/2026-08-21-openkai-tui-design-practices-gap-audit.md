# OpenKai TUI — design practices, current-state audit, and responsive product baseline

**Date:** 2026-08-21  
**Author:** ren@openkai (CPO; TUI lane owner under ADR OK-10)  
**Status:** RESEARCH COMPLETE — recommended baseline; implementation is not part of this handoff  
**Audit point:** repository `HEAD` `5d96ae3ecaf3ca94d52eb426cf116235bcc94126`  
**Builds on:** OK-5 in `2026-08-14-openkai-harness-tui-ADR.md`, the Factory Droid findings, P4/P4b scopes, ADR OK-10, and `docs/ARCHITECTURE_STANDARDS.md`

## 1. Outcome

OpenKai no longer has the seven gaps named in the 2026-08-18 handoff. The current tree already contains a word-level diff overlay, Mermaid-to-Unicode rendering, full mouse routing with a defensive input guard, theme packs with OSC 11 auto-detection, responsive status-chip shedding, headless/PTY tests, and a served browser TUI. Rebuilding those items would duplicate shipped work.

The remaining design opportunity is narrower and more valuable:

1. Make layout behaviour explicit across narrow, standard, wide, and short terminals.
2. Turn `/diff` from a modal-only feature into an **optional contextual workspace drawer** on wide screens, while preserving a single-column chat everywhere else.
3. Make Kaidera the actual default theme contract, not just the splash and theme-picker description.
4. Add terminal capability and accessibility fallbacks (`NO_COLOR`, 16-colour, ASCII, contrast, screen-reader configuration).
5. Delay busy animation for fast operations and coalesce rendering so feedback is informative rather than flickery.
6. Test a size/capability matrix instead of treating 80×24 as the whole product.

The product decision is therefore **chat-first, context-on-demand**, not a permanent dashboard. The transcript, composer, and status line remain the stable frame. Diff, tool detail, plan, and task state occupy a drawer only when the operator asks for them or when an approval requires them.

## 2. Evidence boundary

This document separates three evidence classes:

- **Repository fact** — inspected in the current OpenKai tree at the audit point above.
- **Primary-source pattern** — documented by the named project's official repository, documentation, or a terminal/Unicode standard.
- **OpenKai choice** — a proposed threshold or interaction rule. These are design decisions, not universal industry facts.

No screenshot-based claim is used where source or runtime behaviour can establish the point. Factory Droid is closed-source; only its official documentation and the already-recorded binary analysis are treated as evidence.

## 3. What the best TUIs actually teach

| Source | Primary evidence | Pattern worth taking | What OpenKai should not copy |
|---|---|---|---|
| Factory Droid | Official settings and CLI reference document split/unified diffs, visible mode/autonomy state, one shortcut grammar, Mermaid rendering, theme selection, mouse-independent keyboard control, and focus-aware sounds | Restraint, consistent interaction grammar, visible state, transcript density control, and feature discoverability | Product-specific cloud sync, billing language, or a literal Ink/React stack |
| Lazygit | Official keybinding/config docs expose contextual panels, universal and panel-local actions, `?` discovery, numbered panel jumps, search, and user remapping | Stable focus model: one active pane, contextual actions, and help that names the current context | A permanently dense Git dashboard; agent conversation has a different centre of gravity |
| K9s | Official command/hotkey docs expose `:` command mode, aliases, autosuggestions, `?` help, and reloadable hotkeys | A searchable command namespace plus context-local shortcuts | Kubernetes' resource-centric navigation model |
| btop | Official README documents full mouse support, configurable presets, truecolour → 256 → 16-colour degradation, and glyph fallbacks | Progressive enhancement and layout presets; mouse is additive | Decorative graphs or animation without operator meaning |
| bottom | Official README/docs expose custom widget layouts, focus/expand, mouse + keyboard, and a simplified basic mode | A deliberate constrained-screen mode, not merely clipped desktop layout | Monitor-style one-screen density |
| OpenCode | Official TUI/keybind docs expose a leader-key command list, remappable commands, mouse, attention, and `diff_style: auto` that adapts to terminal width | Semantic commands, automatic diff layout, and configurable input | A second renderer or a dependency/platform rewrite |
| pi-tui / tui-test / xterm.js | Official repositories document differential rendering, normalised mouse/hit-testing direction, xterm-headless snapshots, PTY isolation, accessibility options, and reconnection state | Keep the existing substrate and make behaviour testable at the terminal seam | Framework churn; the current substrate is not the gap |

### Synthesis

The strongest TUIs share five traits despite different frameworks:

1. **The information architecture is stable.** Operators always know what owns focus and where state lives.
2. **Keyboard operation is complete.** Mouse support accelerates; it never unlocks a mouse-only action.
3. **Density is progressive.** Details expand on demand, and constrained terminals have an intentional mode.
4. **State is textual as well as coloured.** A glyph, label, border, or position carries the meaning when colour is unavailable.
5. **Rendering is treated as a compatibility problem.** Colour depth, Unicode width, terminal background, resize, and PTY/browser differences are tested, not assumed.

## 4. Current OpenKai audit

### 4.1 Already present — do not dispatch again

| Capability from the old handoff | Current evidence | Verdict |
|---|---|---|
| Bottom status bar | `packages/cli/src/tui/status.ts`: two-sided status line, busy/approval/attention states, contextual chips, and width-budget shedding | **Present** |
| Diff viewer | `packages/cli/src/tui/diff.ts`: sanitised scrollable overlay, stable line-number gutter, word-level `-`/`+` pairing, keyboard paging; `/diff` in `app.ts` | **Present; modal only** |
| Mermaid ASCII | `packages/cli/src/tui/mermaid.ts`: supported fences render as themed Unicode art and fall back to raw source when invalid or too wide | **Present** |
| Mouse support | `runtime.ts`, `mouse-routing.ts`, and `mouse-guard.ts`: wheel, drag selection, scrollbar, safe URLs, click-to-cursor, SGR/1015/X10 guard | **Present** |
| Visual hierarchy | Three theme surfaces, muted tool borders, danger/attention tokens, opaque overlays, role pills, status chrome | **Present; brand mapping incomplete** |
| Theme pack | `theme-packs.ts` plus dark/light/auto and live preview in `/settings` | **Present; no named exact Kaidera pack** |
| Browser/mobile path | ADR OK-10 plus `headless-host.ts`: the real TUI is streamed to xterm-compatible consumers | **Present; layout breakpoints are not specified** |
| Headless testing | `@microsoft/tui-test`, xterm dependencies, unit/golden tests, PTY e2e tests | **Present; size matrix is thin** |

### 4.2 Remaining gaps, with direct anchors

| Gap | Evidence | Product impact |
|---|---|---|
| Main layout is still a `VStack` | `app.ts` builds `ScrollView → session label → composer → status`; there is no adaptive main-workspace pane | Diff/tools cannot remain visible beside conversation on wide screens |
| Diff is modal and unified only | `/diff` always opens an 80%-width overlay; `diff.ts` has no split/stacked mode or width policy | Review interrupts conversation and wastes wide terminals |
| Narrow layout is not a contract | Most TUI fixtures pin 80 columns; `ModelsHub` reserves a ≥20-column sidebar without a narrow fallback | Browser/mobile or split-terminal behaviour can regress silently |
| Colour capability is fixed at 256 | `theme.ts` always emits xterm-256 styling; exact Kaidera hex is limited to shimmer code; no `NO_COLOR` path was found | Incorrect output on plain/16-colour terminals and avoidable accessibility friction |
| Theme naming exceeds implementation | Picker describes dark as “Kaidera dark — mint on graphite”, while the active default accent is xterm 39 (`#00afff`, cyan) | Brand promise and rendered pixels disagree |
| Busy indicator starts immediately | `setBusy(true)` updates status and begins the frame interval at once | Fast operations flash a spinner and make the interface feel less settled |
| Served accessibility is optional, not specified | xterm.js can enable screen-reader mode and a minimum contrast ratio; no OpenKai browser-attach acceptance contract requires either | The first-party served surface can be visually correct but inaccessible |
| Width-safe Unicode is partial | Composer click mapping uses grapheme segmentation and visible-cell width, but no cross-surface CJK/combining/emoji size matrix exists | Truncation, panes, and gutters may disagree on cell width |

## 5. Product design baseline

### 5.1 Stable frame

The permanent frame is:

```text
┌──────────────────────────────────────────────────────────────┐
│ transcript / active conversation                             │
│                                                              │
│                                                              │
├ session-name · short-id ─────────────────────────────────────┤
│ composer                                                     │
├──────────────────────────────────────────────────────────────┤
│ agent · state · tier · context                    tokens model│
└──────────────────────────────────────────────────────────────┘
```

Rules:

- The transcript is the primary scroll region and owns most height.
- The composer and status line never disappear because a panel opens.
- The session label stays adjacent to the composer; it is context for the next input, not a page title.
- The status line remains one row. Low-priority chips disappear atomically before any chip is cut in half.
- Boot cards and tips collapse first on short screens; live work never does.

### 5.2 Context drawer, not permanent sidebar

At sufficient width, a semantic `workspace.context.toggle` action opens one drawer. `/diff`, tool details, plan/task progress, or a permission preview select its content; the last explicit selection persists for the session.

```text
┌──────────────────────────────────────┬────────────────────────┐
│ transcript                           │ context: diff           │
│                                      │ file.ts                 │
│                                      │  42 │ - old             │
│                                      │     │ + new             │
│                                      │                        │
├ session · id ────────────────────────┤ ↑/↓ · n/N · Esc hide   │
│ composer                             │                        │
├──────────────────────────────────────┴────────────────────────┤
│ agent · state · tier · context                    tokens model│
└───────────────────────────────────────────────────────────────┘
```

Drawer rules:

- Hidden by default unless the operator explicitly opens it or an approval requires visual context.
- Exactly one drawer, not a dashboard of mini-panels.
- Focus is explicit and visible. `Tab` moves between transcript/composer/drawer only when the drawer is open; `Esc` returns to the composer before hiding the drawer.
- The same semantic action is in the command palette and can be user-remapped. Do not reserve a new hard-coded chord in component code.
- Mouse click may focus a pane, but every operation has a keyboard path.
- Closing the drawer preserves its scroll and selected file until the underlying diff changes.
- Read-only watchers of a served session see the focused pane but cannot inject focus or scroll changes.

### 5.3 Width and height modes

These thresholds are **OpenKai choices**. They must be central constants, not repeated conditionals.

| Mode | Terminal size | Behaviour |
|---|---:|---|
| `compact` | `<60` columns or `<16` rows | One column; no drawer; overlays occupy the viewport; boot extras hidden; status retains `state`, `tier` if present, tokens, and truncated model; ASCII-safe borders when capability requires |
| `narrow` | `60–79` columns | One column; `/diff` is a full-width stacked overlay; hub sidebars become searchable single lists; prose uses available width |
| `standard` | `80–119` columns | Current chat layout; overlays may use 90% width; no persistent drawer; prose measure capped at 88 cells when that does not waste the screen |
| `workspace` | `120–159` columns | Optional drawer; chat gets at least 72 columns, drawer at least 38; unified diff in drawer; full-screen diff may split if both code panes retain ≥52 cells |
| `wide` | `≥160` columns | Optional 60/40 drawer with chat prose capped at 88 cells and code/tool output allowed to use its pane; full-screen split diff preferred |

Height behaviour:

- `<16` rows: composer may grow to at most 4 rows; overlays are full-screen; help/footer reduces to one discoverability row.
- `16–23` rows: normal composer cap; drawers and overlays omit decorative blank rows.
- `≥24` rows: full rhythm and contextual metadata.

Resize is live and lossless. Crossing a breakpoint changes presentation, not selected item, scroll anchor, draft, or focus intent. If a drawer is open when width falls below 120, it becomes the active full-screen overlay; widening restores it to the drawer.

### 5.4 Reading measure

“50–75 characters” is not a terminal standard and should not become a magic global wrap. OpenKai should use a render-time prose measure:

- Preferred assistant prose width: **72–88 terminal cells** on wide screens.
- Code, tables, Mermaid, diffs, and tool output use the full pane and never inherit the prose cap.
- Persisted transcript content is never hard-wrapped; reflow occurs on render/resize.
- Width is measured in display cells, not JavaScript string length.

## 6. Diff experience

The current diff renderer is a strong base. The next design increment is presentation and navigation, not a rewrite.

### Required modes

| Surface | Default | Alternative |
|---|---|---|
| Drawer | Unified, no wrap, horizontal viewport if needed | Wrap toggle |
| Full-screen `<132` columns | Stacked/unified | Wrap toggle |
| Full-screen `≥132` columns | Side-by-side when each body is ≥52 cells | Stacked toggle |
| Permission approval | Compact unified preview with the risky row focused | Open full diff without dismissing approval |

### Required controls

- `j/k` or arrows: line movement; `PageUp/PageDown`: page; `Home/End`: bounds.
- `n/N`: next/previous hunk; `]f/[f` or palette actions: next/previous file.
- One visible header states file, base, mode, wrap state, and read-only status.
- Binary, renamed, deleted, and untracked files receive explicit text rows; silence is never interpreted as “clean”.
- Changed words keep the current inverse highlight, but colour is not the only cue: `+`, `-`, gutter, and focus remain.
- Drawer and modal use the same diff state/model. Two renderers of diff semantics would violate S1/S3.

## 7. Kaidera terminal design system

### 7.1 Brand translation

A terminal grid is not a web canvas. The correct translation is:

- **Graphite/paper** carry text and canvas.
- **Mint** marks focus, current mode, safe primary action, and brand moments.
- **Steel** carries borders, muted metadata, and disabled/inactive states.
- **Danger and attention remain separate semantic colours.** Mint must never mean both “selected” and “destructive”.
- Space Grotesk may be used in browser shell chrome outside the terminal. The terminal cells themselves must use the operator's monospace font; forcing a proportional face would break alignment. A first-party attach client may recommend a brand-compatible monospace, but the byte-rendered TUI cannot depend on it.

### 7.2 Exact and fallback palettes

| Token | Exact colour | Nearest xterm-256 | Use |
|---|---:|---:|---|
| mint | `#B0E1CD` | 152 `#AFD7D7` | focus/current/safe primary |
| graphite | `#303234` | 236 `#303030` | dark text/canvas anchor |
| steel | `#858A88` | 102 `#878787` | border/muted metadata |
| paper | `#F1F1ED` | 255 `#EEEEEE` | light text/canvas anchor |
| cream | `#E6E5E0` | 254 `#E4E4E4` | raised light surface |
| light canvas | `#EFEFEF` | 255 `#EEEEEE` | light base |
| dark canvas | `#3D3D3D` | 237 `#3A3A3A` | dark raised surface |

Derived contrast checks using the WCAG relative-luminance formula:

- paper on graphite: 11.37:1
- mint on graphite: 8.89:1
- steel on graphite: 3.67:1
- mint on dark canvas: 7.50:1
- graphite on mint: 8.89:1
- steel on paper: 3.10:1

Therefore mint should not be used as thin text or a thin border on paper. On the light theme, use a mint **filled selection** with graphite text, or graphite text plus a steel boundary.

### 7.3 Neomorphic depth, adapted honestly

Literal blur shadows, 30px radii, and pixel offsets do not exist in terminal cells. “Neomorphic” becomes a three-level tonal system:

- `surface-1`: canvas/transcript.
- `surface-2`: message/tool blocks, normally borderless except for a semantic left rail.
- `surface-3`: composer, status, and active overlay/drawer.
- Raised focus: lighter top/left rule plus a darker bottom/right rule only on large overlays or the active drawer.
- Inset field: one steel boundary and a contrasting interior; no double box around every control.
- Rounded geometry is represented sparingly with box-drawing corners when Unicode is available and square ASCII corners otherwise.

The visual hierarchy must remain legible with all backgrounds disabled. If hierarchy exists only because of a background shade, it is not robust enough.

### 7.4 Capability ladder

| Capability | Rendering |
|---|---|
| Non-TTY / `TERM=dumb` | Plain text; no alt screen, mouse, OSC, animation, or colour |
| `NO_COLOR` present and non-empty | Keep layout, bold/underline where useful, labels/glyphs/borders; emit no ANSI colour |
| 16 colours | Semantic ANSI palette; ASCII or conservative Unicode graphs |
| 256 colours | Mapped Kaidera palette above |
| Truecolour | Exact Kaidera hex; 256 fallback remains deterministic |

OSC 11 remains a valid background query where supported, but it is enhancement, not capability proof. It must retain the current short timeout and fall back without altering a running TUI's input state.

## 8. Interaction grammar

1. `Enter` confirms or submits; `Esc` cancels/backs out; arrows navigate; `Tab` changes focus between peer panes.
2. The command palette is the canonical discovery surface. Contextual commands advertise their current target and resolved keybinding.
3. `?` may open contextual help only when it does not conflict with composer text; the palette remains the always-safe route.
4. Destructive actions require an explicit verb and a text verdict; colour alone is insufficient.
5. Mouse hover never reveals the only explanation or action. Clicks focus/select; drags preserve terminal selection.
6. Input is acknowledged in the next frame. Long operations expose action and elapsed time in the status line.
7. Overlays and drawer reuse the same footer vocabulary. Controls that do not apply in a context are omitted, not shown as dead hints.

## 9. Async and rendering behaviour

These thresholds are OpenKai product choices and need measured validation:

- Do not show the animated busy state for the first **200 ms** of an operation. If the operation settles before then, render only the settled result.
- Permission/approval state is exempt: it appears immediately because the operator is the dependency.
- Coalesce streaming updates into one frame per **16–33 ms** window. A consumer may receive fewer frames, never a backlog.
- Served consumers target 30–60 fps; slow readers receive the newest complete frame and drop intermediates, as required by S4.
- After 2 seconds, the busy label names the current phase/tool and elapsed time. “Working” without a cause is a fallback, not the normal state.
- Animation pauses or degrades to a static glyph under reduced-motion configuration, non-TTY output, and read-only background cells.
- Rendering work is abortable and never blocks input, resize, or approval handling.

## 10. Accessibility, compatibility, and safety

### Accessibility

- Colour is never the only carrier of status; follow WCAG's use-of-colour principle even though a TUI is not a web document.
- Default text targets at least 4.5:1 contrast; essential borders/focus indicators target 3:1 against adjacent surfaces.
- A first-party xterm.js attach client enables `screenReaderMode` and a configured `minimumContrastRatio`, with an operator toggle because screen-reader output volume can be substantial.
- `NO_COLOR`, reduced motion, ASCII borders, and high-contrast themes are user settings, not hidden environment-only behaviour.
- Cursor movement, clipping, selection, and truncation operate on grapheme clusters and terminal cell width. Test combining marks, emoji ZWJ sequences, flags, CJK, Arabic, and ambiguous-width symbols.

### Compatibility

- Terminal features are feature-detected or conservatively inferred from terminfo/environment; `TERM` names are not a proxy for every capability.
- Every resize path is safe at 40×12 through 200×60.
- Browser attach, local TTY, tmux, SSH, and PTY tests share the same application state and renderer.
- Unsupported Mermaid types remain source text with a clear explanation; no network rendering fallback is implicit.

### Safety

- Preserve the existing terminal-text sanitiser at every model/tool/file-content boundary.
- OSC 8 links accept only explicitly safe schemes in the first-party client; xterm.js requires opt-in for non-HTTP protocols for good reason.
- Mouse and focus reports are terminal input, not text; keep them outside components.
- Read-only attach tokens cannot focus, scroll, or submit by construction.
- Diff content is untrusted file content and remains sanitised before styling.

## 11. Recommended implementation waves

This research handoff does not authorise or dispatch implementation. If the product owner opens an increment, use these waves.

### Wave 0 — compatibility floor

Scope:

- Central `LayoutMode` resolver for width + height.
- `compact` fallback for models hub, overlays, boot extras, and status line.
- Capability resolver: plain / 16 / 256 / truecolour, `NO_COLOR`, ASCII, reduced motion.
- Responsive headless and PTY fixtures at 40×12, 60×18, 80×24, 120×30, 160×40, and 200×60.

Acceptance:

- No throw, negative width, clipped composer, or missing status at any fixture size.
- Draft, selected row, scroll anchor, and focus intent survive resize across every breakpoint.
- `NO_COLOR=1` output contains no SGR colour sequences.
- `TERM=dumb` avoids alt-screen/mouse/OSC sequences.

### Wave 1 — workspace drawer + responsive diff

Scope:

- One context drawer state shared by diff/tool/plan views.
- Wide-screen `HBox` layout only when drawer is open and constraints are met.
- Drawer-to-overlay migration on resize.
- Diff split/stacked/wrap/file+hunk navigation using the existing parsed diff model.

Acceptance:

- The transcript/composer/status contract remains byte-equivalent when the drawer is closed.
- Drawer state survives hide/show and wide↔narrow resize.
- Full diff chooses split only when both code panes meet the minimum measure.
- Every mouse action has a keyboard and palette equivalent.

### Wave 2 — Kaidera + accessibility polish

Scope:

- Exact Kaidera dark/light token pair with 256/16 fallbacks.
- Honest theme names and live previews.
- Delayed busy animation, reduced motion, high contrast, and served xterm accessibility configuration.
- Cross-surface grapheme/cell-width audit.

Acceptance:

- Theme-token tests verify the exact and mapped palettes.
- Contrast evidence is recorded for default pairs; colour is not the only state cue.
- Fast operations under 200 ms do not flash a busy animation.
- Screen-reader and minimum-contrast options are enabled and tested in the first-party attach client.

## 12. Verification contract for any implementation

Minimum commands from a clean worktree:

```bash
npm run build
npm run typecheck
npm test
npm run -w @kaidera/openkai test:e2e
```

Required evidence in addition to green commands:

1. Text + cell-attribute snapshots for all six size fixtures in dark, light, `NO_COLOR`, and 16-colour modes.
2. A live resize trace crossing 59↔60, 79↔80, 119↔120, and 159↔160 columns with a non-empty draft and open diff.
3. Keyboard-only completion of open diff → next file → next hunk → close → submit.
4. Mouse parity trace showing focus/click/drag without raw mouse bytes reaching the composer.
5. Local TTY and served/headless settled-frame comparison for the same state.
6. CJK, combining-mark, emoji-ZWJ, RTL-text, long-path, large-diff, binary-file, and malformed-Mermaid fixtures.
7. Frame-pump evidence: update coalescing, bounded queue, and slow-consumer frame dropping.

Focused green tests are implementation evidence, not a release decision. The feature registry and release gate still apply.

## 13. Primary sources

- Factory Droid settings: <https://docs.factory.ai/droid-cli/settings>
- Factory Droid CLI reference: <https://docs.factory.ai/droid-cli/cli-reference>
- Lazygit config/keybindings: <https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md>
- Lazygit generated keybindings: <https://github.com/jesseduffield/lazygit/blob/master/docs/keybindings/Keybindings_en.md>
- K9s commands: <https://k9scli.io/topics/commands/>
- K9s hotkeys: <https://k9scli.io/topics/hotkeys/>
- btop README: <https://github.com/aristocratos/btop/blob/main/README.md>
- bottom README: <https://github.com/ClementTsang/bottom/blob/main/README.md>
- bottom basic mode: <https://bottom.pages.dev/0.9.5/usage/basic-mode/>
- OpenCode TUI: <https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/tui.mdx>
- OpenCode keybindings: <https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/keybinds.mdx>
- pi-tui repository: <https://github.com/earendil-works/pi>
- TUI Test: <https://github.com/Factory-AI/tui-test>
- xterm.js features/API: <https://github.com/xtermjs/xterm.js/> and <https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/>
- xterm.js supported terminal sequences: <https://xtermjs.org/docs/api/vtfeatures/>
- xterm control sequences: <https://www.invisible-island.net/xterm/ctlseqs/ctlseqs.html>
- ncurses terminfo: <https://invisible-island.net/ncurses/man/terminfo.5.html>
- Unicode text segmentation (UAX #29): <https://unicode.org/reports/tr29/>
- `NO_COLOR` convention: <https://no-color.org/>
- WCAG 2.2 use of colour and contrast: <https://www.w3.org/TR/WCAG22/>

## 14. Final disposition of the 2026-08-18 next-step list

| Old next step | Disposition |
|---|---|
| Chat + diff panel | **Adapt:** optional context drawer on wide terminals; overlay elsewhere |
| Kaidera brand everywhere | **Still open:** exact token pair + capability ladder; avoid font and pixel metaphors inside the grid |
| Add diff viewer | **Done:** extend presentation/navigation only |
| Add mouse support | **Done:** retain keyboard completeness and the defensive guard |
| Add neomorphic depth | **Adapt:** tonal surfaces and focus borders, not simulated blur/radius |
| Mermaid ASCII | **Done:** add only compatibility/width fixtures |
| Kaidera theme pack | **Partly done:** dark/light are labelled Kaidera, but the default cyan accent must become real mint or be renamed honestly |

The next implementation should begin at Wave 0. A side drawer built before the layout/capability matrix would make the existing narrow-screen risk worse.

## 15. Validation of this research handoff

Run on the audit tree after writing this document:

- `git diff --check` — passed.
- `npm run -w @kaidera/openkai build` — passed as the first build stage of `test:build`.
- `npm run -w @kaidera/openkai typecheck` — passed.
- Focused current TUI evidence — 60/60 passed across `tui.test.js`, `tui-visibility.test.js`, `tui-polish.test.js`, `mouse-routing.test.js`, and `headless-host.test.js`.
- Aggregate `npm run -w @kaidera/openkai test:build` — **blocked before test execution** by an unrelated test-compile error: `test/security-repro-e002-inc07.test.ts:46` imports `isBlockedFetchAddress`, but `@kaidera/openkai-core` does not export that member. This document does not alter implementation to hide or repair that separate defect.
