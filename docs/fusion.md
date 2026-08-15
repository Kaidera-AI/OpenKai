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

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Synthesis produced. With `--gate`, the gate also passed. |
| `1` | `OPENROUTER_API_KEY` unset, a run error, or `--gate` ended in `weak-gate`/`halt`. |
| `2` | A named model (`--architect-model`/`--builder-model`/`--judge-model`) is not in the OpenRouter catalogue. |

Without `--gate` the gate outcome is `not-run` and a completed synthesis exits `0`.
The gate verdict is printed to stdout as `══ GATE: … ══`.
