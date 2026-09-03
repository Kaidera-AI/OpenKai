# Providers and models

OpenKai separates the model that chats/works from the models Cortex uses for enrichment.

## Chat and task models

Use the TUI:

```text
/login
/model
/settings
```

`/login` connects an available provider. `/model` changes the active model and its role mappings. The **advisor** role supplies the second model used by default two-model teamwork; it falls back through the configured role chain when no explicit advisor model is set.

Use **Settings → Model → Two-model teamwork** to deliberately run only one model. For a child agent, use Agent Hub (`Alt+A`) or an `advisor: false` task-agent definition.

## Cortex enrichment models

Embedding and rerank models live under **Settings → Memory → Cortex Ingest**. They are not chat-model credentials.

- **Embedding model** creates searchable vector representations.
- **Rerank model (Marksman)** optionally improves ordering after retrieval.
- No reranker means vector-only retrieval, shown clearly in memory status.

Choosing one writes the provider/model selection to `~/.openkai/config.json`. It does **not** copy the current chat-provider key. Configure the chosen enrichment provider where Cortex expects its credential.

If `CORTEX_ADMIN_TOKEN` is present, OpenKai attempts to apply the selection to the live Cortex appliance. Otherwise it saves the selection and reports it as pending. Check `/cortex status` or `/memory stats` after changing it.

## Model catalog refresh

```text
/cortex models
```

The picker includes curated options for Ollama, NVIDIA NIM, OpenRouter, and DashScope. Live refresh currently discovers local Ollama embedding models and OpenRouter model-list entries. It does not dynamically discover every possible provider.

## Troubleshooting

- No chat model: run `/login`, then `/model`.
- Advisor not active: confirm **Two-model teamwork** is enabled and an advisor-role model can resolve.
- Cortex provider pending: configure the enrichment provider and use an administrator token if live application is required.
- Reranking unavailable: leave it unset for vector-only retrieval, or inspect `/memory stats` and `/cortex doctor`.
