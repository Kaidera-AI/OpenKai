# RELEASE PLAN — E022: the consolidated TUI (v0.1.10)

**Date:** 2026-09-01 · **Author:** kai@openkai · **Status:** active (Inc 00 done)
**Companion docs:** `EPIC_SPEC.md` (increments + gates), `INC_00_GATE.md` (evidence)

The next release is the fork's first public cut. This plan consolidates the three
asked buckets — goals, fixes, functionality upgrades — grounded in the verified tree
state (build green, 18/18 gates green, upstream v18.0.11 merged zero-conflict + pinned).

---

## A. Goals (standing, ranked — what this release serves)

1. **The formula:** functionality from omp (adopt upstream flows, never fight them);
   look and feel from Droid/Kaidera (sharp hexagon, brand colours, splash every launch).
2. **Fusion + switchyard + RLM are the product core**, default-on: 2-model pairing
   suggested by the scorer (never hardcoded), provider→model selection for both slots,
   interactive `/fuse`, operator-priority UI.
3. **Kaidera identity on first paint:** mint-on-graphite from frame one, hexagon mark,
   status-line glyph, splash + shimmer every launch.
4. **Settings is the container:** themes live inside settings with live preview; no
   separate theme command; display config included.
5. **Zero-friction onboarding:** keyless boot is a permanent gate; subscription
   sign-in (Claude, OpenAI, Kimi Code) + key entry in-TUI; `/setup` re-runs in place;
   only `/exit` exits.
6. **Output legibility + visible permission control:** denials name tool/target/reason/
   remediation; claude-code-grade mouse/input (click-to-cursor, selection editing).
7. **Release control is the CTO's:** explicit consent per version, pre-publish feature
   checklist (FEATURE_REGISTRY.md), four channels, channel-aware upgrade, signed brew.
8. **Adversarial gates every release:** ren → K3 → qwen3.8, findings dispositioned.
9. **OpenKai independent;** KOS bundles it over one canonical provider/model config;
   Cortex is the shared memory layer.
10. **No voice/PTT** (CTO 2026-09-01 — transferred to kaidera-os).

---

## B. Fixes (verified defects and regressions to close in this release)

| # | Fix | Evidence | Inc |
|---|---|---|---|
| F1 | **First-paint theme default is dead code.** Schema default `theme.dark: "titanium"` / `theme.light: "light"` — `Settings.get` falls back to schema defaults, so `initTheme:final` (main.ts:1567) passes `"titanium"` into `configureTheme`, and our `?? "kaidera-dark"` fallback never fires. Result: first paint flashes amber/blue exactly as DOGFOOD_FORK watch item 1 predicts. Fix: schema defaults → `kaidera-dark`/`kaidera-light` (touch-list entry, justified). | `settings-schema.ts:681-703`, `settings.ts:598-608`, `theme.ts:126-127` | Inc 01 |
| F2 | **No explicit theme contract.** No `--theme` flag, no `OPENKAI_THEME` env anywhere in the fork CLI (verified: zero matches in `src/cli/`). KOS ask 6 (CTO priority) needs theme fixed at spawn. | grep of `src/cli/flag-tables.ts` + `launch-help.ts` | Inc 01 |
| F3 | **Splash is omp-branded, and off by default.** `startup.showSplash` defaults `false` (no splash every launch); the scene renders the π mark + "O h  M y  P i", not the Kaidera hexagon / OpenKai identity. | `settings-schema.ts:2112`, `setup-wizard/scenes/splash.ts:192` | Inc 01 |
| F4 | **Build toolchain trap (reproducible).** `/opt/homebrew/bin` rustc (stable 1.98) shadows the rustup `nightly-2026-08-08` directory override → pi-natives fails `E0554` (xutf needs `#![feature(portable_simd)]`). Workaround recorded in FORK.md (`PATH="$HOME/.cargo/bin:$PATH"`). | build log this session | Inc 00 (done) |
| F5 | **0.84-line theme-picker crash** (registry regression row) needs a regression drive on the fork surface before the picker is declared match. | FEATURE_REGISTRY standing risks | Inc 01 |
| F6 | **Cortex `openkai` project registration missing** in the shared API — boot 404s, managed-mode ingest queues silently. Operator action (`cortex-init-project`); until then the ingest test red is environmental, not code. | handoff constraints | Inc 05 |
| F7 | **Keyless boot re-verification** — regressed twice on the old line; permanent gate, must be proven on the fork surface (not assumed from 0.1.9). | standing goal 5 | Inc 02 |

---

## C. Full functionality upgrades

### C1 — Theme & brand completeness (Inc 01)
- Explicit theme contract: `--theme <name|auto|dark|light>` + `OPENKAI_THEME`,
  theme fixed at spawn; `auto` uses upstream's existing OSC 11 query with COLORFGBG
  fallback (already present: `theme.ts:48-62`) — no port needed, just the flag seam.
- Kaidera first paint (F1 fix) + splash every launch (F3 fix, hexagon mark).
- Theme picker inside settings with live preview — **adopt-omp**: upstream already
  wires `previewTheme` with restore-on-cancel (`selector-controller.ts:214-218`);
  skin it, don't rebuild.
- Gate: pty-harness spawn per explicit theme → golden first frames.

### C2 — Fusion-first defaults + switchyard (Inc 03)
- Default flow suggests a 2-model fusion pair across two providers; both slots get
  provider→model pickers; single-provider setups get the recorded advisory.
- Pairing recommendations from switchyard/shift scoring (test asserts scorer source);
  operator-priority setting in the routing tab (OK-9.7).
- Complete the RLM display half: pending-children states in the fusion card; exact
  parent/child usage attribution.

### C3 — Parity census (Inc 02)
- Fork surface enumerated: **136 builtin slash commands** upstream (vs the 0.1.9
  line's 33) + the openkai layer (`/fuse` etc.); 42 CLI subcommands.
- Every FEATURE_REGISTRY row gets ONE disposition: match / adopt-omp / port / retire.
  Priority rows: keyless boot, in-TUI subscription sign-in incl. Claude, `/rename` +
  session-name label, status-line layout with Kaidera chips, `/autonomy` picker,
  mouse click-to-cursor, magic keywords, `/btw`, `/shake thinking`, agent-aware
  `/memory`, `--session <id>` pinning (upstream-native: `--session`/`-r` +
  `--session-dir` confirmed in `flag-tables.ts:178,248`), session-dir story.
- Registry becomes the pre-publish checklist (goal 7).

### C4 — Release machinery (Inc 04)
- Four channels on omp's `build-binary.ts`: npm (bun-compiled; README states the
  bun runtime plainly), brew (signed — users never run `brew trust`), standalone
  signed (Ed25519 manifest + SHA-256 witness + release-key pin), install.sh repoint.
- `openkai upgrade` channel detection + `--check`/`--rollback` parity.
- Fork CI green end-to-end (legacy npm workflow removed/replaced; hung upstream CI
  fixed) before any release step.

### C5 — Trust surface + KOS closure (Inc 05)
- 0.1.9 security-repro suite green on the fork post-v18.0.11 (re-verify F3 claim);
  denials name tool/target/reason/remediation; doom-loop guard retained.
- KOS reply handoff: six asks re-answered for the fork line — PTY submit (1),
  session pinning via native `--session`/`--session-dir` (2), alt-screen replay
  safety (3), headless vs TUI constraint statement (4), Cortex checkpoint
  parity (5), theme contract via Inc 01 (6). Minimum version named: 0.1.10.
- Cortex registration restored (operator action) + managed-mode ingest green.

### C6 — Post-0.1.10 backlog (researched, parked with homes)
- Design-audit waves 0–2 (responsive layout modes, context drawer, capability
  ladder incl. `NO_COLOR`/16-colour/ASCII, exact-token contrast evidence):
  `research/2026-08-21-openkai-tui-design-practices-gap-audit.md` §11.
- DeepSeek/Cordis modularisation + plugin marketplace → E023/E024.

---

## D. Evidence of starting state (this session)

- Fork tree verified at `382afbaabd` (= Kaidera-AI/OpenKai main); branch
  `e022/inc-00-upstream-sync` opened for the epic.
- Pre-merge: build green, CLI smoke green, **18/18 gate tests green** (70 expects).
- Upstream v18.0.11 merged **zero conflicts**; post-merge build + 18/18 gates green.
- Upstream pinned at v18.0.11 in FORK.md; no further merges mid-epic.
- Inc 00 gate evidence: `INC_00_GATE.md`.

## E. Hard floors

- Upstream pristine outside FORK.md's sanctioned touch-list (any new touch — F1's
  schema default, F3's splash art — is recorded there with justification).
- Nothing public without per-version explicit CTO consent (RELEASE_SOP.md).
- Voice/PTT stays out of the OpenKai TUI entirely.
