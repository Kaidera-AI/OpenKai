# Memory

OpenKai supports memory as an optional capability. Choose it in **Settings → Memory**.

| Backend | Use it when | Scope |
| --- | --- | --- |
| **Off** | You want no memory backend | None |
| **Local** | You want memory that stays on this machine | Local profile/session storage |
| **Cortex** | A project needs shared, durable memory | Registered Cortex project |

## Cortex flow

```text
/cortex status
/cortex install
/cortex register [project] [agent] [role]
/memory stats
```

`/cortex install` and `/cortex register` ask before changing state. Registration requires `CORTEX_ADMIN_TOKEN`; it creates a project and its first roster writer. A normal Cortex API token does not grant that administrative operation.

Once active, Cortex can recall relevant shared context on a first prompt, search through `cortex_search`, write intentional facts with `cortex_record` or `learn`, and receive high-signal decision deltas after substantive work.

## Safe write rules

- An implicit Cortex write uses the registered project default writer.
- An explicit writer can be selected with **Cortex Agent** or `OPENKAI_AGENT`.
- If neither is valid, OpenKai refuses the write instead of sending a placeholder identity.
- Text crossing the Cortex write boundary is redacted for known credential patterns.

The automatic delta extractor accepts only friction-earned decisions such as corrections, regressions, and subtle constraints. It strips code fences, quote lines, diff-style payloads, and log-looking lines before checking evidence.

## Transcript ingest

Transcript ingest is **off by default**. If you enable it in **Cortex Ingest**, OpenKai sends prepared visible user/assistant text at session end. Known secrets are redacted, but you should still treat this as deliberate sharing: do not enable it for conversations you do not intend to put in the shared service.

## Enrichment providers

**Cortex Ingest** contains embedding and optional **Rerank model (Marksman)** settings. An unset reranker means vector-only retrieval.

Selections are recorded under `~/.openkai/config.json`. OpenKai does not copy the active chat model's API key into Cortex. Configure the selected enrichment provider in the place Cortex expects credentials. With `CORTEX_ADMIN_TOKEN`, OpenKai attempts live appliance application; without it, the selection is reported as pending.

Run `/cortex models` to refresh supported discovery. Live discovery currently covers Ollama and OpenRouter; the picker also carries curated NVIDIA NIM and DashScope rows.

## Diagnose

- `/cortex status` — endpoint, local/hosted state, project registration, provider outcome.
- `/memory stats` — memory backend and retrieval/degradation information.
- `/cortex doctor` — installed appliance verification.

For project/agent/profile/personality/steering setup, see [Cortex projects and agents](cortex-projects-agents.md).
