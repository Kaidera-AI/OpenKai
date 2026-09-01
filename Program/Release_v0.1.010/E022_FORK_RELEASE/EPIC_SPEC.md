# EPIC SPEC — E022: the fork's first public release

**Epic:** E022_FORK_RELEASE
**Release:** v0.1.10 — **renumbered** (CTO 2026-09-01): the omp-fork line's first public
release ships as 0.1.10; the thin 0.84-line maintenance cut that previously held this
number is CANCELLED (see E020 spec). Ships ONLY on explicit CTO consent per
docs/RELEASE_SOP.md.
**Owner:** kai@openkai (lead) · dev harness: omp+K3 sessions (`ollama-cloud/kimi-k3`)
**Repo:** `~/DevVault/openkai-fork` (the fork line = `Kaidera-AI/OpenKai` main) ·
program of record stays in the OpenKai repo on `maintenance/0.84-line` (this tree)
**Opened:** 2026-09-01 · **Authority:** CTO directives 2026-09-01 (renumber; clean-room
PTT; omp = functionality guide, OpenKai/Kaidera = look-and-feel guide) + the recorded
session goals (see §2)
**Basis:** E021 spike (18/18 gates green, cutover executed) + the 2026-09-01 state-of-play
inventory + the omp-session goals extraction (Program/PROGRESS.md §2026-09-01)

---

## 1. Goal

Ship the fork as OpenKai 0.1.10: omp v18 functionality intact underneath, the Kaidera
identity on top, fusion/switchyard/RLM as the differentiators, every 0.1.9 promise either
carried forward or consciously retired — plus one new differentiator: fully-local
push-to-talk voice input in the TUI.

**The formula (standing, user's words):** *functionality from omp — look and feel from
Droid/Kaidera — that is our formula.* Never fight upstream flows; skin them. Upstream
stays pristine outside the sanctioned touch-list (FORK.md).

## 2. The goals this epic serves (from the omp+K3 sessions, ranked)

1. Build from the omp source line, keep incorporating upstream improvements (2026-08-29,
   latest standing directive).
2. Fusion + switchyard + RLM are the core; fusion default-on (2-model suggestion across
   providers, provider→model selection for BOTH slots, interactive `/fuse`), switchyard
   supplies pairing recommendations (never hardcoded tips) with an operator-priority UI.
3. Kaidera identity: sharp-edged hexagon (the canonical hand-authored mark — no curves),
   lime/mint brand colours, splash + shimmer every launch, logo glyph in the status line.
4. Settings is the container: themes live inside settings with live preview (no separate
   theme command), status-line + display config included.
5. Zero-friction onboarding: keyless boot is a permanent gate (regressed twice on the old
   line); subscription login (Claude, OpenAI, Kimi Code) and key entry all in-TUI;
   `/setup` re-runs in place; only `/exit` exits.
6. Output legibility + permission control: visible working/finished/crashed state,
   folder-access control, denials that name what/where/how-to-allow.
7. Claude-code-grade input: mouse click-to-cursor, selection editing, `/rename` with the
   session name surfaced, status line at bottom.
8. Release control is the CTO's: no publish without explicit consent; a pre-publish
   feature checklist so nothing demoed in `openkai-next*` ever drops out of a release
   again; four install channels; channel-aware upgrade; signed brew (no `brew trust`).
9. Adversarial gates every release: ren deep review → K3 → qwen3.8 security/UAT passes,
   handoffs recorded.
10. OpenKai stays independent; KOS bundles it and consumes the same canonical
    provider/model config; Cortex is the shared memory layer.

## 3. Increments

### Inc 00 — Upstream sync + program truth (prep, partly done 2026-09-01)
- Merge upstream **v18.0.11** (currently one patch ahead of the merged v18.0.10) through
  the monthly-merge review discipline; then PIN for the rest of the epic — no further
  upstream merges mid-epic.
- Program docs: renumber recorded (this spec), E020 cut cancelled, PROGRESS.md goals
  updated, self-handoff placed. LocalFlow clone moved out of the OpenKai repo (licence
  hygiene — see Inc 04).
- **Gate:** fork builds + 18/18 E021 gates still green after the v18.0.11 merge.

### Inc 01 — Theme & brand completeness (the "fix the themes" ask)
- Kaidera theme is the default **first paint** — no amber/blue flash (DOGFOOD_FORK watch
  item 1). Splash + shimmer on every launch; sharp-hexagon mark and status-line glyph.
- Theme selection lives inside settings with **live preview** (omp's picker is the
  functional base — verify, then skin; the 0.84 line's crash-on-theme-nav must have a
  regression drive).
- **Explicit theme contract** (KOS ask 6, CTO priority): `--theme <name|auto|dark|light>`
  flag + `OPENKAI_THEME` env, theme fixed at spawn; `auto` honours OSC 11 query with
  COLORFGBG fallback (port the 0.84 detection contract if upstream lacks it).
- **Gate:** pty-harness spawn with each explicit theme → first frame matches (golden
  frames); theme-picker drive crash-free; the KOS session-theme contract is satisfiable
  end-to-end.

### Inc 02 — Parity census vs 0.1.9 (the "settings and other TUI features" ask)
- Walk `Program/FEATURE_REGISTRY.md` + the 2026-09-01 TUI inventory (33 slash commands,
  20 CLI commands, keymap, session mgmt, security seams) against the fork surface. Every
  row gets ONE disposition: **match** (works on fork) / **adopt-omp** (upstream's flow
  replaces ours — record why it's equal-or-better) / **port** (bring ours over via the
  openkai layer) / **retire** (with reason, CTO visibility).
- Named priority rows (recurring user asks): keyless boot (permanent gate), in-TUI
  subscription sign-in incl. Claude, `/rename` + session name label, status line bottom
  layout with Kaidera chips, `/autonomy` picker UX, mouse click-to-cursor (omp native —
  verify), magic keywords shimmer + fusion routing, `/btw`, `/shake [thinking]`,
  agent-aware `/memory`, `--session <id>` pinning + session-dir story (KOS asks 1–2).
- **Gate:** census 100% dispositioned; every "match/port" row has a TEST_GUIDE drive; the
  registry becomes the pre-publish checklist (goal 8).

### Inc 03 — Fusion-first defaults + switchyard recommendations
- Default model flow suggests a 2-model fusion pair across two providers; both slots get
  provider→model selection; single-provider setups get the recorded advisory.
- Pairing recommendations come from switchyard/shift scoring, not hardcoded tips;
  operator-priority setting surfaces in the routing settings tab (OK-9.7).
- Finish the RLM display half (verification child verdict — landed 08-29; complete the
  pending-children states) and keep parent/child usage attribution exact.
- **Gate:** fusion e2e (panel + judge + gate) green on the fork; a test asserts the
  recommendation source is the scorer.

### Inc 04 — Voice: push-to-talk in the TUI (clean-room, fully local)
- **Licence boundary (binding):** LocalFlow (Vlad Mysla) is source-available
  NON-commercial — it must never be vendored, bundled, or copied. This increment is a
  clean-room implementation of the generic concept; LocalFlow stays a reference only and
  lives outside the repo.
- Feature: hold-to-talk (kitty keyboard protocol key-release where the terminal reports
  it) with a **toggle fallback** (single keybinding starts/stops capture); mic capture
  via ffmpeg avfoundation (feature-detect, macOS first); transcription via
  **whisper.cpp** (MIT) with model auto-fetch on first use (`base.en` default,
  configurable); transcript inserts at the composer cursor — no clipboard, no
  Accessibility permission, nothing leaves the machine. Min-duration guard (~0.3 s)
  against accidental presses.
- Backend seam kept pluggable (one interface, one impl): future backends = provider STT
  via switchyard modality routing, or KaiVoice (the separate SwiftUI app) — noted, not
  built.
- Degraded environments (no ffmpeg, no mic, plain terminal) refuse with a plain
  actionable message.
- **Gate:** live macOS drive (speak → text in composer); runnable check for the
  capture→transcribe→insert pipeline with a fixture wav; degraded-env refusal test.

### Inc 05 — Release machinery on the fork (the "updates and upgrades" ask)
- Four channels wired onto omp's build (`build-binary.ts`): npm (bun-compiled artifact —
  the E020 verdict's accepted reality; README runtime statement updated plainly), brew
  (properly signed — users never run `brew trust`), standalone signed (port the Ed25519
  manifest + SHA-256 witness pipeline + release-key pin), install.sh repoint.
- `openkai upgrade` channel detection + `--check`/`--rollback` parity on the fork.
- **CI adopted for the fork tree:** remove/replace the inherited legacy npm workflow
  (fast-fails on the omp tree) and fix the hung upstream CI (24 h cancel at the tip) —
  main must show a green end-to-end run before any release step.
- **Gate:** fresh install on all four channels passes the 10-drive smoke;
  upgrade→rollback round-trip; CI green on fork main.

### Inc 06 — Trust surface + KOS integration closure
- Deny floor: the 0.1.9 security-repro suite green on the fork (re-verify the F3 claim
  post-v18.0.11); permission denials name tool/target/reason/remediation (goal 6).
- **Reply to the KOS terminal-lane handoff** (docs/HANDOFF_FROM_KAIDERA_OS_TUI_TERMINAL_LANE.md):
  re-answer the six asks for the fork line (theme ask closes via Inc 01; session
  pinning/dir per omp's native machinery; PTY submit + alt-screen replay re-verified on
  omp v18), name the minimum version = 0.1.10, send as a handoff back to kai@kaidera-os.
- Cortex: `openkai` project registration restored in the shared API (operator action —
  currently missing, boot 404s and ingest queues); managed-mode ingest verified green;
  the canonical provider/model config shared with KOS (goal 10) re-confirmed on the fork.
- **Gate:** security-audit equivalent green; KOS reply sent; managed-mode ingest test
  passes against live Cortex.

### Inc 07 — Adversarial rounds + ship
- ren deep review → K3 (kimi-k3) → qwen3.8 pro security/UAT passes, each with a written
  handoff and dispositioned findings (goal 9); dogfood campaign (DOGFOOD_FORK.md) drives
  closed out.
- CHANGELOG [0.1.10]; lockstep versions; tag `v0.1.010`; SOP channel sequence; **explicit
  CTO consent recorded before anything public**.

## 4. Out of scope (parked, with homes)

- DeepSeek/Cordis modularisation + capability seams → E023 (per the OK-11 folding plan,
  re-planned against the fork base).
- Plugin marketplace / PluginLoader → E023/E024.
- ruvector/SONA/federation ledger rows → parked as recorded in the 0.1.9 fold ledger.
- KOS-side work (terminal-lane builder entry, LTM flush wiring) → kai@kaidera-os after
  the Inc 06 reply.
- KaiVoice integration as a PTT backend → noted in Inc 04's seam, not built.

## 5. Risks

1. **Upstream drift mid-epic** — merge v18.0.11 at Inc 00, then pin; next merge is
   post-release (monthly cadence).
2. **bun-runtime npm channel** — messaging must be plain in README/install docs; the
   "pure node ≥ 22.19" promise ends with this release (accepted in the E020 verdict).
3. **kitty key-release availability varies** — hold-to-talk degrades to toggle; never
   gate the feature on protocol support.
4. **Whisper model size/download UX** — first-use fetch with visible progress + config;
   never block boot on it.
5. **Cortex registration is an environment blocker** for managed-mode gates (Inc 06) —
   operator action, tracked, not code.
6. **Fork CI unknowns** (bazel/nix inheritance) — Inc 05 owns making CI trustworthy
   before the ship gate depends on it.

## 6. Exit criteria

1. All Inc 01–06 gates green on the fork tree; CI green on main.
2. Parity census 100% dispositioned; FEATURE_REGISTRY updated to the 0.1.10 surface.
3. The three adversarial passes recorded with findings dispositioned.
4. KOS reply handoff sent; Cortex managed mode verified.
5. CHANGELOG + lockstep + tag + four channels, on explicit CTO consent only.
