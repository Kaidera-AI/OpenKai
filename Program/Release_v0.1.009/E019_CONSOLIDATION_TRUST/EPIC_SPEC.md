# EPIC SPEC — E019: Consolidation & Trust Surface (v0.1.009)

**Epic:** E019_CONSOLIDATION_TRUST
**Release:** v0.1.009 (0.1.9 — ships ONLY on explicit CTO consent, per docs/RELEASE_SOP.md. No version publishes without the CTO's go — standing rule, re-confirmed 2026-08-20.)
**Owner:** kai@openkai (lead) · **lane: ren@openkai (CPO — adversarial review, fixes, magic keywords, mouse investigation)**
**Opened:** 2026-08-20
**Carries:** everything that missed the v0.1.008 cut (see §1).

---

## 1. Goal

v0.1.008 shipped the update-channel work (signed standalone upgrades, `openkai update` executing per-channel) but was cut from a line that **missed two landed batches**. 0.1.9 is the consolidation release: it ships those batches, closes the mouse/crash investigation, and hardens what the adversarial rounds surfaced. No new surface beyond what is listed here — this is the trust release.

**Carried from the v0.1.008 gap (already on main, unreleased):**
- `a1eab24` — E017 UK round 3: 35 findings from the 4-slice adversarial review, fixed (theme-auto stdin kill [CRITICAL], hub resize-kill / tap-leak / focus-restore / shutdown-hang, WS payload caps + directional masking, OAuth device-flow routing, ollama↔ollama-cloud credential collision, OPENKAI_HOME split-brain, fusion bandit phantom arms + double-fail, saver threshold 0.47, session-name escape injection, settings autonomy pop, calibrate guards).
- `fc4cb6e` — E017 UK round 4: magic keywords `ultrathink` (fusion think panel) + `ultrareview` (multi-model adversarial diff review), OMP-derived, with composer/status shimmer, settings toggles, hidden-notice discipline.

**Merged and verified:** `4aee3d1` merge into main @ `9c8cbf8`, 405/405 + security-audit PASSED on the merged tree.

## 2. Increments

| # | Increment | Deliverable | Acceptance |
|---|---|---|---|
| 01 | **Mouse/crash investigation** | Reproduce the CTO-reported crash ("numbers change with moving mouse", recurring wedged TUI on 0.1.8) or prove it unreachable; fix the root cause if found | repro OR documented no-repro with evidence; fix + regression test if found |
| 02 | **Defensive mouse-sequence guard** | A last-line input guard so NO mouse-shaped sequence (SGR/URXVT-1015/X10) can ever reach a component unconsumed, regardless of what the terminal sends | unit test: injected 1015/X10/SGR sequences never reach the editor; pi-tui's own mouse handling (scrollbar/selection/wheel) untouched |
| 03 | **Ship the carried batches** | Version bump 0.1.9 lockstep + CHANGELOG stating plainly that 0.1.9 delivers the fixes 0.1.8 missed (users on 0.1.8 carry the theme-crash and hub-kill bugs) | release SOP run on CTO consent only |
| 04 | **qwen3.8 adversarial pass on the fix batch** | The held handoff (docs/HANDOFF_E017_ROUND4.md, attack areas 1–8) executed against the merged tree; findings triaged and fixed | handoff closed; findings landed or consciously deferred with reasons |
| 05 | **Registry + docs sync** | FEATURE_REGISTRY rows for magic keywords + mouse guard; CHANGELOG 0.1.9 section; handoff doc updated to final state | registry matches shipped surface |

## 3. The mouse/crash evidence log (increment 01 — updated as it lands)

**CTO report (2026-08-20):** "the TUI still keeps crashing, it seems like the mouse control issue and the numbers on screen change with moving mouse." On 0.1.8 (brew).

**Reproduction attempts (all negative):**
- SGR mouse traffic (1006): motion bursts, drag-select, scrollbar hover/drag, wheel spam, double-click — pipes AND real PTY, against 0.1.8 AND the fixed tree: no leak, no crash.
- URXVT 1015 encoding (`\x1b[35;x;yM`, no `<`) and X10 6-byte: no leak.
- pi-tui 0.84.2 defends at three layers: StdinBuffer tokenises CSI atomically; TuiAltScreen's viewport listener parses/consumes all mouse shapes; OpenKai's own listener consumes focus reports.

**Working hypotheses, ranked:**
1. The recurring crash is the **theme-auto stdin kill** (fixed in the carried batch, live in 0.1.8) — the CTO hit this exact bug before; 0.1.8 never shipped the fix.
2. The "numbers" are normal status-line repaints triggered by mouse-driven renders (elapsed/token counters tick on every repaint) — cosmetic correlation, not a leak.
3. A genuinely unobserved leak path (terminal-specific) — needs the crash-guard stack trace the guard prints to stderr ("openkai crashed (terminal restored): …").

**Ask of the CTO:** the next crash's stderr stack verbatim. The guard prints it; that stack names the fault line.
**Workaround until 0.1.9:** `/settings → features → mouse support → off` removes all mouse traffic from the equation.

## 4. Standing constraints

- **Release control:** nothing publishes without explicit CTO consent (re-confirmed 2026-08-20 after v0.1.008 went out early).
- npm versions immutable: 0.1.8 stays as-is publicly; 0.1.9 is the honest follow-up.
- The served TUI (OK-10) regression tests in `test/e017-review.test.ts` pin every round-3 contract; `test/magic-keywords.test.ts` + `test/ultra-turn.test.ts` + `test/composer-shimmer.test.ts` pin round 4.
