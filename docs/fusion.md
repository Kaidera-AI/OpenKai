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
- The synthesis is passed through a **Judge** model.
- The Judge validates the result against the original prompt and a set of baseline requirements.
- If the Judge finds a failure (RED baseline), the synthesis is sent back for repair.
- This loop repeats until the Judge approves or the `--max-rounds` cap (default 3) is reached.

## Usage Example

```bash
openkai fuse --prompt "Implement a secure auth middleware" --gate --max-rounds 5
```

## Exit Codes
Fusion runs halt loudly. If the gate cap is reached without a validated synthesis, the command will exit with an error, signaling that the autonomous loop failed to converge on a valid solution.
