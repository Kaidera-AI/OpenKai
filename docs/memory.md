# Memory & Cortex

OpenKai's memory system is **Cortex-first** — pgvector-backed project memory
with embeddings and reranking. Standalone mode works fully offline.

## Architecture

```
openkai
  └── ~/.openkai/
      ├── sessions/          # Local JSONL session trees (always available)
      ├── .env               # API keys (yours, never uploaded)
      └── config.json        # Session config (model, provider, theme)

Cortex (managed mode)
  └── http://127.0.0.1:8501  # cortex-api REST endpoint
      ├── /sessions          # Session ingestion + checkpoint
      ├── /memory            # Project memory (pgvector embeddings)
      ├── /decisions         # Decision log
      ├── /handoffs          # Agent coordination
      └── /search            # Semantic search across project memory
```

## Modes

### Standalone (default)

No Cortex required. Sessions persist as local JSONL trees. Memory is
local-only. Fully offline.

```bash
openkai  # starts in standalone mode
```

### Managed (Cortex-backed)

Attach to a Cortex deployment for durable project memory:

```bash
# Point OpenKai at your Cortex API
export CORTEX_API_URL=http://127.0.0.1:8501
export CORTEX_PROJECT=myproject

openkai  # sessions checkpoint into pgvector-backed memory
```

## How memory works

### 1. Session ingestion

Every session is ingested into Cortex as a structured document:

- Session ID, model, provider, timestamps
- Turn-by-turn transcript (user/assistant/tool calls)
- Fusion runs (architect/builder outputs, synthesis, gate results)
- Tool call metadata (approval decisions, denial reasons)

### 2. Embeddings

Each turn is embedded as a semantic vector using the configured embedding
model (default: `text-embedding-3-small`). The embedding captures the semantic
meaning of the turn for similarity search.

**Embedding models available:**
- `text-embedding-3-small` — fast, cheap, good for most tasks
- `text-embedding-3-large` — higher quality, better for nuanced queries
- `text-embedding-ada-002` — OpenAI's general-purpose embedding

### 3. Reranking

When the agent searches memory, results are reranked using a cross-encoder
model (default: `bge-reranker-v2-m3`). Reranking re-scores the top-k
candidates for precision, not just recall.

**Rerank models available:**
- `bge-reranker-v2-m3` — best balance of speed and quality
- `bge-reranker-large` — higher precision, slower
- `bge-reranker-base` — fastest, lower precision

### 4. Memory recall

At the start of each turn, OpenKai queries the memory graph:

1. **Semantic search** — embed the current prompt, find k nearest vectors
2. **Rerank** — re-score candidates with the cross-encoder
3. **Inject** — top results are injected into the system prompt as context
4. **Gate** — a lightweight model verifies relevance before injection

This happens **passively** — the agent does not call memory tools. The
memory system works like human recall: relevant context surfaces
automatically.

### 5. Memory extraction

Periodically (semantic drift, K turns since last extraction, session end),
a memory side-agent extracts durable facts from the conversation:

- **Lessons learned** — patterns that worked or failed
- **Decisions** — architectural choices and their rationale
- **Preferences** — coding style, naming conventions, tool preferences
- **Project context** — file layout, dependencies, environment setup

Extracted memories are stored in the project memory graph with embeddings
for future recall.

### 6. Memory consolidation

Periodically (ambient mode), memories are reorganised:

- Stale memories archived
- Conflicting memories flagged
- Duplicates merged
- Importance re-scored

## Configuration

### `~/.openkai/config.json`

```json
{
  "memory": {
    "enabled": true,
    "embeddingModel": "text-embedding-3-small",
    "rerankModel": "bge-reranker-v2-m3",
    "maxRecallItems": 5,
    "consolidationIntervalHours": 12
  }
}
```

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `CORTEX_API_URL` | Cortex API endpoint | `http://127.0.0.1:8501` |
| `CORTEX_PROJECT` | Active project key | (required for managed mode) |
| `OPENKAI_EMBEDDING_MODEL` | Embedding model override | `text-embedding-3-small` |
| `OPENKAI_RERANK_MODEL` | Rerank model override | `bge-reranker-v2-m3` |
| `OPENKAI_MEMORY_MAX_ITEMS` | Max memory items to inject | `5` |

## CLI

```bash
# Check memory status
openkai info

# Search project memory
cortex-search "how did we handle the auth flow?"

# View recent decisions
cortex-log kai decision "chose pgvector over chroma for memory"

# Ingest a session into Cortex
openkai sessions --ingest <session-id>

# View ingested sessions
openkai sessions --list
```

## Integration with fusion

Fusion runs are also ingested into memory:

- Architect and builder outputs are embedded separately
- Synthesis artifacts are embedded as merged documents
- Gate results (checks, outcomes, failures) are embedded as decision records
- Fusion telemetry (bandit recommendations, pair performance) feeds the
  memory graph

This means the fusion system learns from past runs: the bandit recommends
pairs based on what actually worked in similar tasks, not just generic
model rankings.

## Cortex repo

The Cortex backend lives at
[github.com/Kaidera-AI/cortex](https://github.com/Kaidera-AI/cortex).
It provides:

- REST API for session ingestion, memory, decisions, handoffs
- pgvector-backed semantic search
- Agent coordination (handoffs, claims, returns)
- Project isolation (each project has its own memory graph)

For local development, run Cortex locally:

```bash
# Start Cortex API (requires Docker + Postgres)
cd ~/DevVault/kaidera-os
docker-compose -f .agents/docker-compose.cortex.yml up -d
```

The API runs at `http://127.0.0.1:8501`. OpenKai auto-detects it.
