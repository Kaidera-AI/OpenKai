# Fusion — Multi-Model by Default

OpenKai is **fusion-first**. Every task can run through an architect +
builder panel, merged with an attributed synthesis, and optionally wrapped
in a gate-first validation loop. Single-model is the fast path; fusion is
the quality path.

## Philosophy

> **Different models make different errors.** GPT-4o stumbles on reasoning
> chains Claude handles well. Gemini misreads ambiguous instructions Mistral
> interprets correctly. When you run several models in parallel and aggregate
> their answers, individual errors tend to cancel out.

OpenKai's fusion is not a wrapper — it is the **default architecture**. The
harness is built so that any task can be fused, and the fusion system learns
from every run.

## The fusion pipeline

```
Task
  │
  ├─ Panel (FU-1)
  │   ├─ Architect session ── fresh context, model A
  │   └─ Builder session ─── fresh context, model B
  │   (parallel, independent)
  │
  ├─ Synthesis (FU-2)
  │   └─ Third session ───── fresh context, model C
  │       Merges with attribution:
  │       • consensus[]
  │       • divergences[{topic, architect, builder, kept}]
  │       • discarded[{item, reason, by}]
  │       • blindSpots[]
  │
  └─ Gate (FU-3, optional)
      ├─ Validator designs executable checks BEFORE work
      ├─ Baseline MUST fail red (gate proves nothing otherwise)
      ├─ Builder rounds with repair loop (cap 3)
      └─ Halt loudly with full transcript
```

## Commands

```bash
# Single-model (fast path)
openkai chat --prompt "explain this repo's layout"

# Fusion (default for complex tasks)
openkai fuse --prompt "design the caching layer"

# Fusion with gate-first validation
openkai fuse --prompt "implement the auth middleware" --gate

# Choose models for each role
openkai fuse --prompt "review this PR" \
  --architect-model anthropic/claude-3.5-sonnet \
  --builder-model openai/gpt-4o

# Let the bandit pick the pair
openkai fuse --prompt "optimise this query" --auto
```

## Roles

### Architect

The architect plans, critiques, and merges. It sees the task's explicit
requirements and produces:

- Approach outline
- Risk assessment
- Review criteria
- Merge instructions for the synthesis session

Default: a strong reasoning model (Claude 3.5 Sonnet, GPT-4o, Gemini 2.5
Pro).

### Builder

The builder implements. It sees the architect's plan and produces:

- Working code or analysis
- Tests or verification steps
- Known limitations and edge cases

Default: a strong implementation model (GPT-4o, Claude 3.5 Sonnet, DeepSeek
V3).

### Synthesis

The synthesis session merges architect and builder outputs with
**mandatory attribution**. Every merged item is tagged:

- `[ARCHITECT]` — the architect's position
- `[BUILDER]` — the builder's position
- `[CONSENSUS]` — both agree
- `[DIVERGENCE]` — both disagree, both positions kept
- `[DISCARDED]` — rejected, with reason and attribution

An unattributed merge is a **regression to one opinion** and throws
`AttributionError`.

### Gate (optional)

With `--gate`, a validator designs executable checks **before** any builder
run. The baseline MUST fail red — an all-green baseline means the gate is
theatre and throws `WeakGateError`.

- Validator reads the task's explicit requirements
- Designs 2-5 executable checks (file exists, test passes, pattern matches)
- Baseline run MUST fail at least one check
- Builder rounds with repair loop (cap 3, then `GateHaltError`)
- Gate repair once per run (does not consume a builder round)
- Builder never grades its own homework — gate execution is fully outside
  role sessions

## Model selection

### Bandit recommendations

The fusion bandit learns from every run. It tracks:

- Which model pairs produce the best outcomes
- Task complexity buckets (architecture, ambiguous, high-blast-radius,
  routine)
- Cost vs quality trade-offs

The bandit recommends pairs based on **what actually worked in your
project**, not generic model rankings.

```bash
# Bandit picks the pair
openkai fuse --prompt "refactor the auth module" --auto

# See what the bandit recommends
openkai fusion report
```

### Casts

Casts are curated model role sets — the bandit's arm space. Each cast
defines an architect/builder pair optimised for a task class:

| Cast | Architect | Builder | Use |
|---|---|---|---|
| `reasoning-heavy` | Claude 3.5 Sonnet | GPT-4o | Complex logic, multi-step reasoning |
| `code-heavy` | GPT-4o | DeepSeek V3 | Implementation, refactoring, testing |
| `review-heavy` | Claude 3.5 Sonnet | Gemini 2.5 Pro | Code review, security analysis |
| `fast-cheap` | Gemini 2.5 Flash | DeepSeek V3 | High-volume, routine tasks |
| `reasoning-max` | GPT-4o | Claude 3.5 Sonnet | Cross-provider diversity |

### Self-pairing

With a single provider, self-pairing is the default (same model for both
roles). The bandit flags the compromise: "one provider — self-pairing works,
but a second lane lets two INDEPENDENT models fuse."

## Telemetry

Every fusion run is recorded:

- Per-role model, latency, token usage
- Gate outcome (if used)
- Bandit recommendation and confidence
- Synthesis attribution breakdown
- Cost per run

```bash
# View fusion telemetry
openkai fusion report

# Per-pair performance
openkai fusion report --pair "anthropic/claude-3.5-sonnet+openai/gpt-4o"
```

## When to fuse

| Task | Fuse? | Why |
|---|---|---|
| Simple Q&A | No | Single model is faster and cheaper |
| Architecture decision | Yes | Two perspectives prevent blind spots |
| Complex implementation | Yes | Builder + reviewer catch more bugs |
| Code review | Yes | Cross-model review finds more issues |
| High-stakes changes | Yes + gate | Gate proves the work before it lands |
| Research/exploration | Maybe | Fusion if ambiguity is high |
| Routine tasks | No | Bandit routes to single cheap model |

## When NOT to fuse

- **Latency-sensitive**: parallel + synthesis adds ~2x latency
- **Very long documents**: synthesis may lose nuance from 50K+ token context
- **Model-specific features**: Claude's extended thinking, OpenAI's code
  interpreter — these are per-model, not transferable
- **Distinctive creative voice**: synthesis averages toward the centre

## Fusion + memory

Fusion runs are ingested into Cortex memory (see [Memory](memory.md)):

- Architect and builder outputs embedded separately
- Synthesis artifacts embedded as merged documents
- Gate results embedded as decision records
- Bandit telemetry feeds the memory graph

The fusion system **learns from your project** — not just generic model
rankings, but what actually worked in similar tasks on your codebase.
