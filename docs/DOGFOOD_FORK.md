# Dogfood drive — the fork (E021 F5)

The fork is installed as `openkai-next-fork` (the built omp/18.0.0 + the
openkai layer). Drive it next to `openkai-next` (the 0.1.9 maintenance line)
and compare — the cutover decision rides on this.

## Setup

```bash
openkai-next-fork --version   # omp/18.0.0 + openkai layer
openkai-next --version        # openkai 0.1.9 (maintenance line)
```

## The fork drives (what to verify — the layer's gates)

1. **Boot + brand** — the Kaidera theme is the default (mint accent on
   graphite). If the first paint looks amber/blue, the theme default regressed.
2. **Fusion** — ask: "use the fusion tool to decide X" or type `/fuse <task>`.
   SEE: the ◆ fusion panel card, both roles, the judge's combined verdict.
   A divergent verdict admits a verification child (rlm_spawn) — collect it
   with "collect the child results" (rlm_collect).
3. **Shift** — run a task that errors repeatedly; the status line gains the
   `t:cap`/`t:eff` chip and the model switches lanes on a flip.
4. **The deny floor** — ask it to write `.env` or anything outside the folder.
   SEE: an absolute refusal naming the pattern — no overlay, no approval path.
5. **Magic keywords** — type `ultrathink <question>`: the word shimmers (omp's
   native machinery) AND the turn routes through the fusion panel (our
   upgrade). `ultrareview <context>` runs the adversarial review of the
   current diff.
6. **Cortex memory** — with `CORTEX_PROJECT=openkai openkai-next-fork`: the
   cortex_search/cortex_record tools exist; record a learning, search it back.

## The parity checklist (fill as you drive — the cutover evidence)

| Surface | Fork (omp base) | 0.1.9 line | Winner |
|---|---|---|---|
| Turn aliveness (loader/shimmer/cards) | | | |
| Tool cards (live states, diffs) | | | |
| Composer (history, paste, images) | | | |
| Permissions UX (overlays, patterns) | | | |
| Fusion verdicts | | | |
| Tier routing visibility | | | |
| Deny floor honesty | | | |
| Sessions (resume/fork/tree) | | | |
| Speed / memory feel | | | |
| Crash record | | | |

## Reporting

Same anomaly template as docs/DOGFOOD.md; mark findings FORK or LINE.
Crash stacks verbatim — the fork's guard prints them the same way.
