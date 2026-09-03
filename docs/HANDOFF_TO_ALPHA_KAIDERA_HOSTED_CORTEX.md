# Handoff: kai@openkai -> alpha@kaidera — hosted Cortex service for the Kaidera platform

**Date:** 2026-09-03 · **Authority:** operator (CTO) directive 2026-09-03: offer
Cortex as a hosted service through the Kaidera platform at a later date; add it
to the Kaidera platform project plan now, and review it when OpenKai reaches
**v0.1.13** planning. This handoff carries the technical context so the plan
entry is concrete rather than a placeholder string.

## The demand

OpenKai's next memory spine is Kaidera Cortex (`github.com/Kaidera-AI/cortex`);
Hindsight (vectorize-io) is being removed from OpenKai entirely. A slice of
OpenKai operators will not run the local six-layer appliance — they want the
memory hosted, exactly as Claude Code/Codex consume Cortex over HTTP today.
The platform owns the hosted tier; OpenKai owns the client side.

## Client contract OpenKai is building (already specified, E023 Inc 06)

- Transport: `CORTEX_URL` + `CORTEX_TOKEN` (the agent plane from Cortex's own
  `docs/providers-standalone.md` — subscriptions for thinking, token for memory).
- Settings rows: `cortex.apiUrl` (default `http://localhost:8501` for the local
  appliance), `cortex.token` (credential, empty for local), project scoping.
- Status row distinguishes **local appliance / hosted / not installed**; the
  TUI install flow (`preflight` then operator-confirmed `install`) covers the
  local leg. Hosted leg = token issuance + project provisioning, no install.
- Ingest is client-push over the same API (`cortex-ingest*` semantics), so a
  hosted tenant sees lessons, decisions, and (opt-in) transcripts like a local
  one.

## What the platform plan must decide (our questions for alpha)

1. **Tenancy:** project-per-tenant or shared-project with per-tenant agents;
   how `cortex-init-project`/`cortex-add-agent` map onto platform accounts;
   token issuance and rotation surface (CLI, dashboard).
2. **Enrichment economics:** Cortex's embed/graph workers need providers.
   Free tier proposes Ollama-backed enrichment on the platform (private,
   capex-only); paid tiers propose OpenRouter production rung. Who pays for
   re-embed runs (`cortex-embed`) when a tenant changes model?
3. **Lifecycle:** backups (`cortex-backup`), retention (`cortex-retain`), and
   the fail-loud `/degradation` posture surfaced to tenants; SLA floor.
4. **Edges:** hosted Cortex consumed by other harnesses too (Claude Code,
   Codex, KOS) — one service, many clients; OpenKai's rows are only one of
   several consumers of the same contract.

## OpenKai-side schedule (our placeholder, committed)

`Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/EPIC_SCOPE.md` §Future and
`Program/PROGRESS.md` now carry: *raise hosted Cortex at the v0.1.13 planning
gate*. The 0.1.11 cut ships local-appliance + hosted-capable client rows; the
service itself waits for the platform.

## Ask

Add a plan line item to the Kaidera platform project plan (owner alpha@kaidera,
review window: OpenKai v0.1.13 planning, ~two cuts out), with the four
decisions above as its exit criteria. Reply with the plan reference so the
OpenKai ledger can link it; no code work is requested of either side this turn.
