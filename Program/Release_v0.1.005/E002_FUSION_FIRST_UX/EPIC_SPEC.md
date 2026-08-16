# EPIC SPEC — E002: Fusion-First OpenKai (v0.1.005)

**Epic:** E002_FUSION_FIRST_UX
**Release:** v0.1.005 (next minor — ships when the CTO is happy, per the release rule)
**Owner:** kai@openkai (lead developer)
**Opened:** 2026-08-16 · **Supersedes the remainder of:** E001 Inc 09 remainder folds in here
**Inputs:** CTO directive 2026-08-16 (fusion-focused harness, Switchyard routing, parity bar, onboarding, capability management, brand polish)

---

## 1. Goal

OpenKai becomes the **fusion-first harness**: fusion is not a flag, it is the product's centre of gravity — every operator sees curated multi-model options by default, routing picks the right model per job, and the TUI guides them there. At the same time the TUI reaches the out-of-box bar of pi/omp/droid with a first-run setup that connects providers and memory in under two minutes.

## 2. Terminology (proposal — CTO picks or edits)

| Concept | Our term | Why |
|---|---|---|
| Fusion run (architect + builder) | **Duet** | two voices, one piece |
| Attributed synthesis artifact | **Accord** | the agreement record |
| Per-stage/per-job model routing (Switchyard pattern) | **Shift** | the work shifts lanes per stage |
| Curated model sets per role/stage | **Cast** | a cast chosen for the performance |
| First-run guided setup | **Welcome** | plain word, honest thing |

(Code names stay as-is in v0.01.001; renames land with the v0.1.005 surface: `openkai duet`, `shift` maps in config, casts in the picker.)

## 3. Increments

| # | Increment | Deliverable | Acceptance |
|---|---|---|---|
| 01 | **Fusion-first defaults (Casts)** | Curated model sets per task class (cheap/balanced/frontier × solo/duet); the model picker surfaces casts first ("Duet: llama-70b architect + 8b builder"); `openkai fuse` defaults to the balanced cast; casts are config data, editable | picker shows casts; a duet runs with two DISTINCT models by default; cast config file documented |
| 02 | **Shift — per-job routing (Switchyard pattern, Apache-2.0 port)** | `packages/core/src/shift/`: stage router over pi-ai — classify stage (plan/build/review) deterministically, route each to its cast model; provider fallback chain on 429/5xx with capped retries; routing events on the activity feed | unit tests: stage classification, fallback chain order, budget guard; live run shows different models per stage in `openkai tail` |
| 03 | **Welcome — first-run setup** | First-run flow (no providers configured → guided): pick providers (detected keys offered), test connectivity live, pick default cast, choose memory mode (file-based project memory in cwd `.openkai/` vs Cortex-managed with a reachability check); writes config, teaches the approval loop in one scripted turn | fresh HOME e2e: completes in <2 min, produces working first turn; skip path works; re-runnable via `/welcome` |
| 04 | **Parity completion** (E001 Inc 09 remainder) | bash-mode `!` toggle with prompt glyph; double-Esc rewind menu (with undo entry); model retry (one key, re-run last turn on another model); autonomy axis chip (off/low/med/high, one-key cycle, layered over the permission rules); session `/tree` + `/fork` with resume receipt; light/dark theme pair; `Ctrl+J` in-product changelog | each item live-verified + headless-tested; suite stays green |
| 05 | **Capability management** | `openkai skills` (list/add/remove from `.agents/skills` + registry), `openkai mcp` (add/remove/test MCP servers into the harness config); statusline: configurable chips in the chrome (config file `~/.openkai/config.json`) | add/remove round-trip works; MCP server config validated; statusline reflects config |
| 06 | **Brand polish** | Kaidera hexagon mark with colour-shimmer boot animation (gradient sweep across the hex, ~1s, once-ever + `openkai --splash` to replay); welcome-card in transcript on fresh sessions with the five keys every operator needs | shimmer verified via frame capture; welcome card present once |
| 07 | **v0.1.005 release** | version bump, CHANGELOG, binaries, brew formula, npm publish, release notes | full channel verification on this Mac |

## 4. Standing invariants (carried from E001 + new)

1–8 as E001 (Cortex API only; patterns over linkage; reproducer evidence; token-only colour; commit-before-dispatch; return discipline; fusion invariants; CPO amendments).
9. **The Switchyard port is patterns-only** — no Rust dependency (ADR §5.4); protocol translation is pi-ai's job already.
10. **Onboarding never forces Cortex** — file-based memory is the default; Cortex is offered, tested, and clearly optional (ren A1).
11. **The release rule:** no version bump, no publish, until the CTO signs off after UAT (docs/uat-plan.md updated per increment).

## 5. Risks

- **Scope weight** — this is a bigger epic than E001; mitigated by the parity work already landed and by increments shipping independently reviewable.
- **Routing quality claims** — Shift's stage classification is deterministic config first (FU-4 discipline); no performance claim without a reproducer (standing rule).
- **Onboarding flakiness across machines** — e2e via tui-test with a fresh HOME; no network dependency in tests.
