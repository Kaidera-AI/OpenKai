# E023 Inc 06 — Cortex memory gate

**Status:** remediation implementation complete in the source worktree; **unreleased** pending final validation and external acceptance.

This replaces the former gate record because it mixed historical test counts, obsolete command names, and unobserved compiled/local-service drives with release-ready claims.

## Implemented contracts

| Contract | Implementation |
| --- | --- |
| Settings-driven connection | Settings own endpoint/token/project/agent; managed environment values override them. |
| Roster-safe writes | Explicit agent or project default is required before durable write. Missing roster rejects before payload transmission. |
| Redacted outbound data | Memory, transcript, error, result, and Fusion persistence boundaries redact known credential patterns. |
| Poison-resistant extraction | Fenced blocks, quotes, diffs, and log-shaped lines are excluded before evidence admission. |
| Opt-in transcripts | Session ingest defaults off. |
| Provider single authorship | OpenKai serializes `~/.openkai/config.json` mutations and records embedding/rerank selection there. |
| Honest provider application | Admin-token live apply reports live/pending/failed; no chat-provider credential copy. |
| Installation/project automation | `/cortex install` is confirmed; `/cortex register` and `/cortex agent` are confirmed and registration requires `CORTEX_ADMIN_TOKEN`. |
| Public commands | `/cortex status|preflight|install|register|agent|doctor|models`, `/memory stats`, and `/fusion` are the documented surfaces. |

## Final code checks

Run from the source fork after the final code edit:

```sh
bun --cwd=packages/coding-agent run check
bun --cwd=packages/coding-agent test test/openkai-cortex-memory.test.ts test/openkai-cortex-extension.test.ts test/openkai-fusion.test.ts test/openkai-fusion-pairing.test.ts test/model-resolver.test.ts
```

Also run syntax checks for both installers and their targeted test coverage. The finalization handoff records the exact observed results; this document does not invent a historical all-suite pass count.

## External acceptance required before release

| Check | Why it cannot be inferred from unit tests | Status |
| --- | --- | --- |
| Clean-host installer/binary drive | Verifies the downloaded public `openkai` executable, asset name, PATH behavior, and first launch. | Pending operator environment |
| Local Cortex install and registration | Requires a clean local appliance plus `CORTEX_ADMIN_TOKEN`. | Pending operator environment/credential |
| Live enrichment-provider application | Requires the selected provider credential and admin token. | Pending operator environment/credential |

## Non-blocking compatibility notes

- Internal runtime package names and legacy storage paths remain for compatibility; public help and assets must not display them as product branding.
- Dynamic enrichment discovery is intentionally limited to supported Ollama/OpenRouter refresh paths; curated rows cover the other providers.
- Hosted Cortex rollout is not claimed by this increment.

## Decision

Do not ship Inc 06 until the code checks and all three external acceptance checks have recorded evidence. See `DISPOSITION_REN_INC06.md` and `docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md`.
