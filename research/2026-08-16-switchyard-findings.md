# Switchyard findings — NVIDIA NeMo (routing research for E002 Inc 02)

**Date:** 2026-08-16 · **Author:** kai@openkai · **Repo:** github.com/NVIDIA-NeMo/Switchyard (1658★, **Apache-2.0**, Rust, pre-alpha, active)

## What it is

A Rust proxy + library for LLM traffic: routes requests across providers, translates between OpenAI Chat / Anthropic Messages / OpenAI Responses formats, records Prometheus metrics. Launch modes: proxy server, agent launcher (`switchyard launch claude|codex|openclaw`), library.

## What we take (patterns only — ADR §5.4, no Rust dep)

1. **Signal-driven stage routing** — the core idea: different stages of a task (planning, building, reviewing) route to different models. Our port: `packages/core/src/shift/` — a stage router over pi-ai's Models. Stage classification is DETERMINISTIC config first (FU-4 discipline), not a model call on the hot path; their LLM-classifier routing stays a later option.
2. **Provider fallback chains** — on 429/5xx/timeout, shift to the next candidate in the cast with capped retries (their multi-backend routing, degraded gracefully).
3. **Routing metrics as telemetry** — their Prometheus metrics; ours: routing decisions land on the activity feed + fusion run records (already our shape).
4. **Protocol translation — NOT taken**: pi-ai already speaks 30+ providers natively; translating protocols is redundant for us.

## What we don't take

The proxy-server topology (OpenKai is in-process; KOS lanes already own cross-process). The agent-launcher wrapper (KOS's lane shape is that answer). Their roadmap instability (pre-alpha API churn).

## Terminology fit

Shift = our per-stage routing layer; casts = the curated model sets it routes among; Duet/Accord = the fusion pair + its merge artifact. Default posture: both embedded — every task can shift, any task can duet.
