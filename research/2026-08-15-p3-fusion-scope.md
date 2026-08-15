# P3 Scope — Fusion Core (FU-3 / FU-1 / FU-2), kai development lane

**Date:** 2026-08-15 · **Author/executor:** kai@openkai · **Epic:** E001 Inc 04
**Sources:** E016 ADR §3.2 (FU-1/FU-2/FU-3 full text), OpenKai ADR OK-6 + §6 P3, E016 invariants.

## 1. What this slice is

`packages/core/src/fusion/` + `openkai fuse`: run one task through two roles (architect, builder) as **separate fresh sessions** in parallel, merge with a **third fresh session** into an attributed synthesis artifact, and optionally wrap the work in the **gate-first validation loop** (FU-3 in full). Completion-based roles (no tool calls inside roles yet — tool-using roles need the permission-engine wiring and arrive with Inc 05/06 integration).

## 2. Invariants (code-enforced, not comments)

1. **Fresh sessions.** Each role gets its own `Context` — no shared message arrays, no history replay across models (E016: never replay one model's turns as another's history). Panel asserts disjoint context objects.
2. **Attribution mandatory.** Synthesis items carry `[ARCHITECT]`/`[BUILDER]` tags; an unattributed divergence/discarded item throws `AttributionError` (E016: unattributed merge = regression to single opinion).
3. **Gate-first.** With `--gate`: the validator designs executable checks from the task's explicit requirements BEFORE any builder run, read-only. The baseline run MUST fail RED — an all-green baseline throws `WeakGateError` (gate is theatre otherwise). FAIL output feeds back verbatim. Cap 3 builder rounds, then `GateHaltError` with the full transcript. Gate repair once per run, does not consume a builder round, weakening a legitimate check forbidden. Builder never grades its own homework: gate execution is fully outside role sessions.
4. **Opt-in only.** Fusion runs only via explicit `openkai fuse` (FU-4 deterministic policy is Inc 06).
5. **Telemetry by-product.** Every run appends a `FusionRunRecord` (FU-5 shape: per-role model/latency/usage + gate outcome) to `.openkai/fusion/runs.jsonl` — local-first (ren A1), Cortex artifact export is Inc 06.

## 3. Files

```
packages/core/src/fusion/
  types.ts      — FusionRole, RoleOutput, SynthesisArtifact, GateCheck, GateRun, FusionRunRecord, options
  complete.ts   — one-call completion over a StreamFunction (injectable; faux in tests, builtinModels OpenRouter in prod)
  panel.ts      — FU-1: architect+builder in parallel, fresh contexts, RoleOutput[]
  synthesis.ts  — FU-2: third fresh completion -> strict parse -> attribution enforcement -> SynthesisArtifact
  gate.ts       — FU-3: design-gate / baseline-RED / evaluate / repair-loop with caps + loud halts
  telemetry.ts  — FusionRunRecord append to .openkai/fusion/runs.jsonl
  index.ts
packages/cli/src/fuse.ts + index.ts — openkai fuse --prompt ... [--gate] [--architect-model M] [--builder-model M] [--max-rounds N]
```

Role prompts (E016 §3.2): architect plans/critiques/merges; builder implements. Synthesis prompt demands the exact JSON contract `{consensus[], divergences[{topic,architect,builder,kept}], discarded[{item,reason,by}], blindSpots[]}`; parser validates tags on divergences/discarded.

## 4. Verification

- `node --test` (cli test runner, bob's P4 harness): panel independence (faux factory discriminates roles by system prompt), synthesis attribution throw, baseline-green WeakGateError, cap-halt, repair-once semantics, telemetry record shape. All offline via `createFauxCore` scripted responses.
- build + typecheck green from clean.
- Live smoke (if OPENROUTER_API_KEY present): `openkai fuse --prompt "Name three properties of a good CLI error message"` prints two role outputs + attributed synthesis + run record path.

## 5. Explicitly not here

Admission-handle subagents (OK-6) — they arrive when fusion panels must outlive a turn (Inc 06 with KOS handoff-filed dispatch). FU-4 policy, FU-5 store/report — Inc 06. Tool-using roles — Inc 05 integration.
