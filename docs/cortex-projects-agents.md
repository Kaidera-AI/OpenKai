# Cortex projects, agents, profiles, personas, and steering

Cortex is an optional shared notebook for a project. It is useful when several OpenKai sessions or people need the same decisions, constraints, and lessons. It is not needed to use OpenKai normally.

## Five separate ideas

| Name | Meaning | Do not confuse it with |
| --- | --- | --- |
| **Cortex project** | One shared memory namespace | A local OpenKai profile |
| **Cortex agent** | A rostered writer identity in that project | A model role or personality |
| **OpenKai profile** | Local login, settings, and session separation | A Cortex project |
| **Personality** | How the active model speaks | Authorization or memory ownership |
| **Steering** | A message to one live worker | A permanent project rule |

A Cortex role is roster metadata. It does not make a model behave like a different persona. Put enduring behavior in project instructions or a task-agent definition; use Cortex memory for durable project facts and decisions.

## Setup

1. Start `openkai`.
2. Open **Settings → Memory**.
3. Set **Memory Backend** to **Cortex**.
4. Run `/cortex status`.
5. If a local appliance is missing, run `/cortex install`.
6. To create the shared project and its first writer, set `CORTEX_ADMIN_TOKEN` in the terminal that launches OpenKai, then run `/cortex register [project] [agent] [role]`.

OpenKai asks before installation, registration, and roster changes.

```text
/cortex status
/cortex preflight
/cortex install
/cortex register payments kai lead
/cortex agent reviewer reviewer openai/gpt-5.4
/cortex doctor
/cortex models
```

`/cortex register` invokes Cortex project initialization with the current project root and first roster agent. `CORTEX_ADMIN_TOKEN` is required because it changes shared service state; a normal Cortex API token is not enough.

`/cortex agent <name> <role> [model]` adds a writer identity to an already registered project. The role/model arguments describe the roster entry; OpenKai model roles and personality stay configured separately.

## Writer identity safety

Every durable Cortex write needs a real writer identity. OpenKai uses:

1. `OPENKAI_AGENT`, if set;
2. the **Cortex Agent** setting, if set; otherwise
3. the Cortex project's registered default agent.

If no default agent exists, OpenKai refuses the write and tells you to register the project or choose a registered agent. It does not send a placeholder identity into shared memory.

## Endpoint, token, and project precedence

Use Settings for normal use. Environment variables override Settings for managed deployments.

| Value | Settings row | Environment override order |
| --- | --- | --- |
| Endpoint | Cortex API URL | `CORTEX_API_URL`, `CORTEX_URL` |
| API token | Cortex Token | `CORTEX_API_TOKEN`, `CORTEX_TOKEN` |
| Project | Cortex Project | `CORTEX_PROJECT` |
| Writer | Cortex Agent | `OPENKAI_AGENT` |

If no project is configured, OpenKai derives a tentative key from the current folder name. That does not bypass roster validation: writes still need an explicit or registered default agent.

## What gets remembered

With Cortex enabled, OpenKai can:

- recall relevant project memory on the first prompt;
- search it with `cortex_search`;
- save a deliberate fact with `cortex_record` or `learn`; and
- extract high-signal decision deltas after substantive work.

The automatic extractor keeps corrections, regressions, and subtle constraints. It removes fenced blocks, quotations, diff-style content, and log-like lines before treating a user message as evidence. The evidence must still appear in the cleaned message.

Transcript ingest is **off by default**. If enabled, OpenKai prepares visible user and assistant text for session-end ingest and redacts known credential patterns at the outbound boundary. That is not a reason to upload secrets: only enable transcript sharing for content you intend to place in the shared service.

Use `/memory stats` and `/cortex status` to inspect backend health and recent provider-application status.

## Embedding and rerank models

Choose these in **Settings → Memory → Cortex Ingest**. The optional rerank row is **Rerank model (Marksman)**. Unset means vector-only retrieval and is shown as such.

OpenKai records the selection in `~/.openkai/config.json`. It does not copy the current chat model's credentials into that record or into Cortex. Configure credentials for the chosen enrichment provider where Cortex expects them.

With `CORTEX_ADMIN_TOKEN`, OpenKai tries to apply the selection to the live appliance. Without it, the selection is saved and reported as **pending**; it is not falsely reported as live.

The picker has curated options for Ollama, NVIDIA NIM, OpenRouter, and DashScope. Live refresh currently discovers local Ollama embedding models and OpenRouter model-list entries only. Run `/cortex models` to refresh those supported sources; do not assume arbitrary providers are dynamically discovered.

## Profiles and personality

A profile separates local state:

```sh
openkai --profile work
openkai --profile personal
```

Two profiles can intentionally point to the same Cortex project, but doing so shares durable project memory. Confirm the project key and writer identity before saving to a shared environment.

Choose the response style in **Settings → Model → Prompt → Personality**:

- **Default** — terse, evidence-first.
- **Friendly** — warmer and more encouraging.
- **Pragmatic** — direct and efficient.
- **None** — no personality block.

Personality changes wording, not security permissions, task tools, or the Cortex writer name.

## Project rules, task agents, and steering

Use `AGENTS.md` for standing project rules. Use a task-agent definition when a recurring worker needs a different role, tool set, or system prompt. Current compatibility discovery uses legacy `.omp/agents/*.md` project storage; that path is not the public product command and exists so existing agent definitions keep working.

Start with `openkai agents unpack --project`, then copy and adapt a bundled definition. The command uses the compatible project storage for you; do not create a legacy directory just to add an agent.

A basic task agent can deliberately use one model:

```md
---
name: reviewer
description: Find correctness risks in a change.
model: "@review"
advisor: false
---

Review the assigned change and report file-and-line evidence.
```

Without `advisor: false`, task agents use the default two-model teamwork. Configure model roles in `/model`'s Roles view.

To steer a live worker:

1. Press `Alt+A` for Agent Hub.
2. Select the worker and press `Enter`.
3. Send one precise instruction, for example: `Do not alter schema files; finish API tests first.`

Steering affects that running session. It is not a permanent persona and does not rewrite project memory. Put durable rules in `AGENTS.md`, a task-agent definition, or an intentional Cortex memory.

## Troubleshooting

1. `/cortex status` — is the endpoint reachable and the project registered?
2. `/memory stats` — is the backend active and is provider application pending?
3. `/cortex doctor` — is the installed local appliance healthy?
4. Writer error — register the project or set a rostered **Cortex Agent**.
5. Provider selection pending — configure the enrichment provider and use an administrator token for live application.
