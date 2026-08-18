# Fusion Core

The Fusion core is a specialized execution mode for tasks that require both high-level planning and low-level implementation.

## Semantics

Fusion operates by splitting a single prompt into two distinct roles:

1. **The Architect (FU-1):** Focuses on the structure, design, and constraints of the solution.
2. **The Builder (FU-1):** Focuses on the implementation, coding, and technical execution.

These roles run in separate, fresh sessions in parallel to prevent "role collapse" or premature convergence.

## Attributed Synthesis (FU-2)
After the Architect and Builder complete their tasks, OpenKai performs a **Synthesis**. The final output is a merged artifact where contributions are explicitly attributed to the role that produced them. This ensures the user can distinguish between a design decision (Architect) and a technical implementation (Builder).

## Gate-First Validation (FU-3)
By passing the `--gate` flag, you enable the gate-first validation loop. 

In this mode:
- The gate runs **before** the work, to prove it can fail. A baseline that is already
  green proves nothing, so the run stops as a **WEAK GATE** rather than claiming success.
- With a RED baseline established, the synthesis is passed through a **Judge** model.
- On failure the Judge's verbatim feedback is fed back for repair.
- This repeats until the gate passes or the `--max-rounds` cap (default 3) is reached,
  which halts loudly as a **HALT** for triage.

## Usage Example

```bash
openkai fuse --prompt "Implement a secure auth middleware" --gate --max-rounds 5
```

## Calibration (`openkai fusion calibrate`)

The calibration harness (OK-9 W6/W7) turns recorded run outcomes into an
escalation-threshold recommendation — Switchyard's quadrant method, not a
borrowed operating point.

**Record shape** (JSONL, one line per run; pooled from `--runs` and the
optional `--baseline` file):

```json
{"taskId": "auth-middleware", "tier": "capable", "score": 0.62, "outcome": "pass"}
```

- `tier` — which arm the run served (`capable` or `efficient`).
- `score` — the corroborative scorer value recorded for the task at routing
  time (0..1); this is what the threshold sweeps against.
- `outcome` — `pass` / `fail` for that arm on that task.

Pairing is by `taskId`: tasks present in both arms land in a quadrant —
**RESCUE** (efficient fails, capable passes: escalation rescues the task),
**LOSS** (efficient passes, capable fails: escalation loses quality),
**SAFE** (both pass), **HARD** (both fail). Tasks seen in only one arm are
reported as unpaired and excluded.

```bash
openkai fusion calibrate \
  --runs .openkai/fusion/runs.jsonl \
  --baseline calibration/capable-baseline.jsonl
```

The report shows, per threshold candidate (0.30–0.80): the strong-call
fraction and the quality gap closed (RouteLLM's CPT/APGR frame), rescued
RESCUE tasks, and over-escalated LOSS tasks. The recommendation is
Switchyard's rule: **the lowest threshold that rescues RESCUE without
over-escalating LOSS** — and when the data cannot separate the quadrants, the
report says so instead of faking a clean pick. Every run writes a dated
record under `research/calibration/` (override with `--record-dir`).

The report closes with the **judge break-even** line (OK-9.4, LangChain's
formula): `judgeCost / (dearCost − cheapCost)` from live catalogue pricing —
the fraction of calls that must offload to the cheap tier for the judge to
pay for itself. Models come from `--judge-model` / `--cheap-model` /
`--dear-model` (+`--provider`), or fall back to the configured/default cast.
The same line is emitted as an activity event whenever a fusion run resolves
its judge, so `openkai tail` shows the judge economics of live runs.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Synthesis produced. With `--gate`, the gate also passed. |
| `1` | `OPENROUTER_API_KEY` unset, a run error, or `--gate` ended in `weak-gate`/`halt`. |
| `2` | A named model (`--architect-model`/`--builder-model`/`--judge-model`) is not in the OpenRouter catalogue. |

Without `--gate` the gate outcome is `not-run` and a completed synthesis exits `0`.
The gate verdict is printed to stdout as `══ GATE: … ══`.
