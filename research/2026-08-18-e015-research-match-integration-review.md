# E014/E015 research-match + integration review (ren, 2026-08-18)

**Scope:** everything built on `release/0.1.007` for E014/E015 (shift tier scorer, `routeWithTier`, task outputSchema + stage-routed children, connectors + `bridge --listen`, fusion dashboard), matched against the **full** research corpus: round 1 (ruflo, RuVector, ruvLLM, prime-agent, opencode, pi/omp), round 1.5 (Factory droid), E016 ADR, round 2 deep dive (`2026-08-18-switchyard-routing-fusion-deep-dive.md`, [DD]) and OK-9.
**Verdict up front:** the machinery is lean and research-faithful, but the *composition is headless and unwired* — the two things the research is loudest about (visibility in the TUI; the closed telemetry→router loop) are exactly what's missing. Elegance is one facade and one TUI slice away.

---

## 1. What the research says vs what got built

### Correctly taken (verified against code)

| Research | Where it landed | Note |
|---|---|---|
| Switchyard corroborative tanh scorer, window=3, DEEP_TURN=8, one-signal≈0.4621 [DD §2] | `shift/tier.ts` | Faithful port, constants preserved |
| Hard overrides: critical error / compaction → capable; settled run → efficient [DD §2] | `decideTier` rules 1–2 | Compaction input exists (`compacted` flag) |
| `decision_source` observability on a redacting sink [DD §2, §5.10] | `routeWithTier` emits `override/tests_passed/dimensions/fall_open` | Matches Switchyard's label taxonomy minus `llm-classifier` (deliberately parked) |
| Self-pair default, gate-first, no debate-for-code, panel=2 [DD §4] | fusion core (earlier) + capability doc | Held |
| Bandit over gate outcomes; per-bucket priors (BaRP/dueling line [DD §3]) | `fusion/bandit.ts` + telemetry | Reward loop *defined* — see gap 4 |
| Stage→cast dynamic child model (plan→architect, build→builder, review→judge) | `task.ts` `stage` param | Explicit `modelId` wins — correct precedence |
| Fail-open pool on empty modality filter | `filterByModality` | Right default for a young catalogue |
| Capability doc parking discipline (prefill router, hot-path judge, panels>2) | `2026-08-18-kos-capability-fusion-switchyard.md` | Matches OK-9.6 |

### Deviations that are bugs (fed to the K3 fix pass)

1. **SOFT severity is dead** — `windowSeverity` maps plain nonzero exits (`/exit(ed)? (code )?[1-9]/`) to HARD 0.7; nothing ever returns SOFT 0.3. Switchyard's 0.5 threshold was calibrated against the 0.3/0.7/1.0 table; our mapping shifts the operating point upward — routine failing commands score as hard errors and corroborate escalation too easily.
2. **`/\bOK\b/i` as a test-pass pattern** fires on ordinary output ("OK", "ok"); combined with a dead fail-literal check this can false-positive `tests_passed` and de-escalate a struggling run to efficient.
3. **outputSchema required-keys are regexed from prose** (`/"([A-Za-z_][\w]*)"\s*:/g` over the contract text) — nested keys, `"type":`, `"description":` all become "required". Any formal JSON Schema contract fails validation 100% of the time. Parse the contract as JSON when it parses and read `.required`/top-level `properties`; fall back to the regex only for prose contracts.
4. **`bridge --listen` re-implements hub auth weaker**: `!==` token compare (hub was hardened to timing-safe), no 1MiB body cap (hub has one), no Slack `url_verification` challenge handling (Slack webhooks can't even activate), and no `bot_id`/subtype filtering — a connector that posts replies into the channel will consume its own messages as prompts (self-loop). Reuse the hub's hardened helpers; drop bot/subtype events.

### Research not yet taken (the real gaps)

| # | Research item | Status | Cost of the gap |
|---|---|---|---|
| 1 | **OK-7 / bob's visibility research / droid bar: fusion+routing must be VISIBLE** — per-agent role pills, status chips, gate toasts | **Absent.** Nothing in E014/E015 touches the TUI | The differentiator is invisible; routing without a visible rationale is the thing users fight (OK-9.7 trust requirement) |
| 2 | **OK-9.3 composition is unwired**: `routeWithTier` has **zero production callers** (tests only); `fuse.ts` drives `ShiftRouter` directly; the TUI transport never routes | Machinery without a composition point | Two parallel routing paths now exist — the exact fork the ADR warns against |
| 3 | **Tier latch / session stickiness** (OK-9.1; Switchyard session affinity) | Absent — `decideTier` is stateless per call | A noisy signal can flap tiers turn-to-turn mid-phase |
| 4 | **Gate outcome → bandit reward loop** (the Context→Action→Feedback closure — Agent-as-a-Router's information-deficit fix [DD §3]) | Telemetry is written; nothing reads it back into routing priors | The router never learns; we're the static router the paper warns about |
| 5 | **Compaction = free tier-switch point** (Devin Fusion; OK-9.3 rule 3) | `compacted` is an input; nothing in the TUI's auto-compact path calls it | Missed zero-cost switching |
| 6 | **OK-9.7 posture/pins** (`shift.posture`, floor/ceiling pins) | ADR only (W8) | `routeWithTier` hardcodes `defaultTier = "efficient"` — the operator's exchange rate has no input path |
| 7 | **Gate-cap → tier-escalation retry** (FrugalGPT cascade move, OK-9.3 rule 2) | Absent — a fusion halt just halts | The cascade half of "route + cascade" is one-sided |
| 8 | Judge break-even meter (W7), calibration harness (W6) | Not started | Thresholds stay at an uncalibrated 0.5 (borrowed operating point) |
| 9 | Switchyard handoff notes / per-tier system prompts | Not taken | Small; note as deliberate or backlog |

---

## 2. Elegance assessment

What's right: `tier.ts` is pure and separately testable; `routeWithTier` composes rather than editing `ShiftRouter`; connectors are a 35-line normaliser; the dashboard is a pure fold. kai kept the dependency list untouched and the diff to 724 lines. The *parts* are in the repo's idiom.

What isn't:

1. **Two routing paths, no orchestration entry.** `ShiftRouter.route()` (stage + fallback, used by `fuse.ts`) and `routeWithTier()` (stage + tier, used by nobody) coexist. Every consumer wires its own composition. The elegant shape is **one facade** in core:
   ```
   orchestrate(task) → { stage, tier, latched, panel? , pair, gate }
   ```
   `fuse`, `task`, the chat path, and the TUI all call it. Bandit priors, posture config, and the latch live inside it — not at call sites.
2. **The TUI is dark.** The event stream already flows through the TUI (activity sink, status chips, transcript notices). Surfacing routing is *render work only*: a `tier:eff▸cap` chip transition on override, role-pill fusion blocks (the P4b per-agent identity work already specifies the tokens), a gate pass/fail notice. This is the highest differentiation-per-line slice available — the research corpus (OK-7, bob's visibility findings, droid's chrome discipline) is unambiguous that the TUI is where this pays.
3. **Config has no routing surface.** `shift.posture` belongs beside `autonomy` in config + the interaction settings tab; today the tier default is a string literal in a function call.
4. **Bridge auth duplicated-and-weaker** than the hub it fronts (finding 4 above) — one shared `requireBearer(req)` helper kills a class.

---

## 3. The integration design (efficient landing order)

Sequenced by value-per-line, each independently shippable:

**S1 — TUI visibility slice (render-only, no core changes).** Status chip for active tier with transitions logged; fusion runs render role-pilled blocks (`[ARCHITECT]`/`[BUILDER]` tokens from theme.ts per P4b); gate outcome + halt notices; `/shift` ledger command reading the activity feed (OK-9.7 trust requirement). ~All inputs already on the event stream.

**S2 — Orchestration facade (core).** `orchestrate()` owning: stage classification → latched tier decision (per-stage latch map) → posture-aware default tier → FU-4 policy (panel vs single) → gate → reward writeback. `routeWithTier` and `ShiftRouter.route` become internals; `fuse.ts`, `task.ts`, and the session transport migrate to the facade. Kills gap 2, 3, 4, 6 in one move.

**S3 — Compaction hook.** The TUI's auto-compact (80% ctx) calls `orchestrate.reevaluateTier()` — the Devin free-switch point (gap 5). Small.

**S4 — Cascade completion.** Fusion halt at cap → facade escalates the stage one tier → single retry (gap 7). Small once S2 exists.

**S5 — Calibration + break-even meters (W6/W7).** Only after S2 generates real decision telemetry; thresholds stay at 0.5 with loud logging until then.

K3 fix-pass items (§1 deviations) land first — they're correctness, not design.

---

## 4. Bottom line

The E014/E015 parts are good parts. The research corpus says the value is in the *loop* (telemetry→priors→routing) and the *visibility* (TUI); both are currently absent, and both are cheap because the event infrastructure already exists. S1+S2 are the smallest changes that make the system match its own ADR.
