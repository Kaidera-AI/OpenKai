# OpenKai Capabilities — what the harness can and can't do

Ground truth: the code on `main` (0.1.9-dev). Every row cites the module that
implements it. When behaviour and this document disagree, the code is right —
file it as a bug.

## 1. Sessions & persistence

| Can | Can't (yet) |
|---|---|
| Persist every session as a branchable tree under `.openkai/sessions/` (`session-store.ts`) — `/resume`, `/fork`, `/tree`, `/sessions` | Share sessions across machines (local files only; Cortex mode checkpoints into shared memory when `CORTEX_PROJECT` is set — `runtime.ts` resolveRunMode) |
| Rename a session (`/rename`) — sanitised, 48-char truncation in the header | Edit history entries (append-only log) |
| Export a session as self-contained HTML (`/export`) | |
| Steer a running turn mid-flight (type while busy — the message queues into the turn) | Cancel mid-tool from the keyboard (double-Esc clears the draft; Ctrl+C asks to quit) |
| Undo the last gated mutation (`/undo` — shadow-git snapshot restore) | Undo ungated reads (nothing to undo) |

## 2. Tools & permissions

Tools the model can call: `read_file`, `write_file`, `edit_file` (hashline),
`bash`, `grep`/`glob`-style listing, LSP queries, MCP server tools, `task`
(subagents) — all through the permission gate (`core/session/permission-gate.ts`,
`tools.ts`).

| Can | Can't (yet) |
|---|---|
| Gate every mutation behind an operator decision (default `off` — everything asks) | Per-path allow rules ("always allow src/**") — the `always` cache is per-tool, per-session |
| Session-scoped `Always` approvals from the overlay (never persisted) | Project-persistent approvals via overlay (write `tools.approval.<tool>` in `~/.openkai/config.json` — the settings routing tab shows them read-only) |
| Deny floor that no approval can lift: `.env`, keys, `.ssh`, and paths outside the working folder are refused outright (`permissions.ts`) | Bash command-pattern rules (OMP's `bash.patterns` glob allow/deny list is researched, not folded in — E019 inc 06 candidate) |
| Plan mode (`/plan`): read-only; mutations refused at the gate | |
| Operator sees every denial named: tool, target, reason, and the exact place to change it (transcript error row) | |
| The model receives denial text with the remediation path — it relays config actions instead of asking you to run commands yourself | |

## 3. Access levels (`/autonomy`, settings → interaction → access level)

| Level | Meaning |
|---|---|
| `off` | Every write/bash asks first (default) |
| `low` | Reads + in-folder writes auto-approve; bash always asks |
| `med` | In-folder writes auto-approve; bash still asks |
| `high` | **Full access** — writes + bash auto-approve; only the protected-path floor refuses |

The working folder is the process cwd. Anything outside it is deny-floor —
no level lifts that.

## 4. Models & providers

| Can | Can't (yet) |
|---|---|
| 30+ providers via env keys or OAuth device flow (`/settings` → providers, `openkai provider list/set/unset`) | Provider failover mid-turn (fallback chains exist for streams — `capped-retry` — not for provider outages mid-turn) |
| 800+ model catalogue via OpenRouter, keyless local Ollama | Fine-tuned model hosting |
| `/model` five-level picker (provider → model), `/models` hub, thinking-effort cycling | |
| Shift tier routing: the orchestrator watches tool signals and moves stages between efficient/capable tiers (`/shift` ledger) with posture pins (quality/balanced/saver, floor/ceiling/never) | Explain a routing decision beyond the reason string (the ledger carries stage, source, reason) |
| Fusion: two-model panel + judge synthesis (`/fuse`, configurable pair) with gate validation (`--gate` CLI) | More than two panel members |

## 5. Magic keywords

| Keyword | Effect |
|---|---|
| `ultrathink` | Multi-model fusion think run over the prompt (hidden reasoning notice rides the payload) |
| `ultrareview` | Multi-model adversarial review of the current shadow diff |

Standalone prose only — never in code spans, fences, or paths. Rainbow shimmer
while typing, static gradient in sent messages, shimmering status while the
panel runs. Toggles: settings → interaction → magic keywords.

## 6. The terminal surface

| Can | Can't (yet) |
|---|---|
| Click-to-cursor in the composer (click positions, drag selects) | Clickable links inside the transcript (OSC 8 rendering yes, click-open via terminal) |
| Live turn lifecycle: thinking pulse (✻), running tool cards, brand-shimmer activity with elapsed seconds, `✓ settled in Ns · tokens · tok/s` at turn end | Typewriter-smooth streaming reveal (OMP's 30fps reveal — researched, not folded in) |
| Mouse: wheel scroll, drag-select copy, scrollbar drag | |
| Theme packs with live preview (settings → appearance → theme) | |
| Crash guard: a fatal error restores the terminal and prints the stack | |

## 7. The served TUI (`openkai serve` / hub)

| Can | Can't (yet) |
|---|---|
| Host sessions over HTTP+WS (loopback + bearer, host-verified): `POST /sessions`, `GET /attach/<id>?mode=ro|rw` | Remote access beyond loopback (by design) |
| Read-only attaches watch; rw attaches drive input; resize is clamped | Attach to a session after its run ends (ended sessions are evicted) |
| 16 hosted sessions max (429 beyond) | Authentication beyond the bearer token |

## 8. Updates & channels

| Can | Can't |
|---|---|
| `openkai update` detects the install channel (brew/npm/bun/standalone) and executes its upgrade | Downgrade in one step (`--rollback` restores the previous standalone binary) |
| Standalone channel is signed end-to-end (Ed25519 manifest, fail-closed witness) | |
| Kill-switch: `OPENKAI_NO_UPDATE`/`OPENKAI_DISABLE_UPDATE` refuses auto-upgrade | |

## 9. Memory

| Can | Can't (yet) |
|---|---|
| Project memory: `.openkai/memory/learnings.md`, shared across agents in the folder (`/memory add`) | Cross-project memory search from the TUI (Cortex mode checkpoints; `openkai events` reads them) |
| Session goal pinning (`/goal`) | |
