# OpenKai Feature Registry (living)

**Purpose:** no shipped feature ever silently disappears again. Every user-facing feature is listed here with its origin and its **verified presence** in the current tree. This file is the release gate: a release is blocked if any ✅/🔁 row is absent from the build, and every new feature is added here in the same PR that lands it.

**Rule (release gate, E017 inc 10):** before any release — walk this registry, verify each ✅/🔁 row against the build (command exists, keybind fires, chip renders, test passes), and record the audit in the release notes. Rows marked ❌ carry the reason + the decision-maker; 📋 rows are promised-but-unshipped with their target.

**Legend:** ✅ present · 🔁 regressed-and-restored · ❌ dropped (reason attached) · 📋 promised, not yet shipped

---

## Slash commands

| Feature | Introduced | Status (0.1.7 tree) | Anchor / note |
|---|---|---|---|
| `/help` | 0.1.1 | ✅ | commands.ts |
| `/model [id]` | 0.1.1; picker 0.1.4; five-level 0.1.5 | ✅ | direct switch fixed 0.1.6 (dead case removed) |
| `/models` hub | 0.1.5 | ✅ | models-hub.ts |
| `/sessions` `/resume` `/new` | 0.1.1 | ✅ | store rehydration fixed 0.1.6; bare `/resume` opens the searchable picker 0.1.7; `/sessions` shows names 0.1.7 |
| `/name <text>` | 0.1.7 | ✅ | `session_name` custom entry (append-only analogue of pi's session_info); surfaces in /sessions, /resume search, /export |
| `/export [path]` | 0.1.7 | ✅ | self-contained HTML transcript (inline CSS, theme palette hexes); `.jsonl` suffix dumps the raw session file |
| `/exit` (+`/quit` alias) | 0.1.5 | ✅ | |
| `/btw` | 0.1.1 | ✅ | side channel, unpersisted |
| `/undo` | 0.1.1 | ✅ | shadow-git |
| `/shift` | 0.1.7 | ✅ | routing ledger over activity.jsonl (OK-9.7 trust surface) |
| `/diff` | 0.1.7 | ✅ | shadow snapshot → work tree overlay (read-only) |
| `/fuse [task]` | 0.1.5 | ✅ | in-TUI panel; 0.1.7: bare `/fuse` menu gains "configure fusion models" — two-step provider→model pickers for model 1 (architect) and model 2 (builder), session-model and self-pair resets; `/stats` shows the pair |
| `/retry [model]` | 0.1.5 | ✅ | |
| `/fork` `/tree` | 0.1.5 | ✅ | v3 parent links; `/fork` is a rewind-to-message picker 0.1.7 (forkAtEntry + prefill-through-restart) |
| `/autonomy` | 0.1.5 | ✅ | picker over the gate |
| `/plan` | 0.1.5 | ✅ | gate-enforced 0.1.6; transport-owned |
| `/theme` | 0.1.5 | ❌ removed 0.1.7 (CTO) — themes live in /settings as a visible picker list; no separate command | appearance tab |
| `/goal` | 0.1.5 | ✅ | boot card surface |
| `/setup` | 0.1.5 | ✅ | onboarding panel |
| `/settings` | 0.1.5 | ✅ | seven tabs (routing added 0.1.7) |
| `/init` | 0.1.5 | ✅ | never overwrites |
| `/memory` | 0.1.5 | ✅ | .openkai/memory |
| `/clear` `/copy` `/stats` `/context` `/compact` `/shake` | 0.1.5 | ✅ | real-context ops; `/compact` is LLM-summarising (summary + retained tail, incremental) 0.1.7 |
| `/login` | 0.1.5 | ✅ | = /setup providers tab |
| `/logout <provider>` | 0.1.5 | ✅ | app.ts |
| `/features` | 0.1.5 | ✅ | app.ts |
| `/effort` `/fast` | 0.1.4 | ✅ | app.ts |
| `/welcome` | 0.1.1 | ❌ dropped 0.1.5 — duplicate of `/setup` (E005 decision, changelog) | deliberate |

## CLI subcommands

| Feature | Introduced | Status | Anchor / note |
|---|---|---|---|
| `openkai` / `tui` (+ bare-flag launch) | 0.1.1 / 0.1.3 | ✅ | keyless boot 0.1.6 |
| `chat --prompt` | 0.1.1 | ✅ | named exit on missing creds |
| `sessions` | 0.1.1 | ✅ | `--search <query>` 0.1.7 (fuzzy/`"phrase"`/`re:` via tui/session-search.ts); name column 0.1.7 |
| `events --print` | 0.1.1 | ✅ | SSE bridge |
| `fuse` (+`--cast`, `--gate`) | 0.1.1 / 0.1.5 | ✅ | |
| `fusion report` / `advise` / `dashboard` | 0.1.1 / — / 0.1.6 | ✅ | dashboard K3-hardened |
| `fusion calibrate` | 0.1.7 | ✅ | OK-9 W6/W7: quadrant table + threshold recommendation + judge break-even; dated records in research/calibration |
| `undo [--history]` | 0.1.1 | ✅ | |
| `login <provider>` | 0.1.1 | ✅ | persistent store 0.1.5+ |
| `tail [-f]` | 0.1.4 | ✅ | activity feed |
| `info` | 0.1.1 | ✅ | always exit 0 |
| `upgrade` / `update` | 0.1.1 / 0.1.4 | ✅ | witness + rollback + kill-switch; release-key seam 0.1.6 |
| `skills` `mcp` `statusline` | 0.1.5 | ✅ | capability management |
| `serve` | 0.1.5 | ✅ | hardened 0.1.6; 0.1.7(+OK-10): hosts served TUI sessions (POST /sessions) with the WS attach channel (hello replay, ro/rw scopes, frame/state streams — docs/attach-protocol.md) |
| served TUI (hosted session + attach) | 0.1.7 | ✅ | a real TuiController per hosted session; browser xterm.js is a dumb client; KOS grid consumes it |
| `bridge` (`--listen` 0.1.6) | 0.1.5 | ✅ | K3-hardened: dedup, ack-fast, self-loop guard |
| `splash` | 0.1.5 | ✅ | replays brand animation |
| `help [topic]` | 0.1.5 | ✅ | |
| `version` | 0.1.1 | ✅ | |
| `openkai provider` (list/set/unset) | 0.1.7 | ✅ | the single provider-config write path (TUI + CLI + KOS Settings share it); atomic, comment-preserving, 0600, OPENKAI_HOME-honouring |
| `openkai duet` (rename of fuse) | 0.1.5 | ❌ retired 2026-08-19 (CTO) — `fusion` is the product term; no alias | E002 §2 |
| `openkai search` | — | ❌ retired 2026-08-19 (CTO) — session search stays out of scope | E001 Inc 09 item 9 |

## Keybindings

| Feature | Introduced | Status | Anchor / note |
|---|---|---|---|
| Enter / Shift+Enter grammar | 0.1.1 | ✅ | |
| Ctrl+K palette | 0.1.1 | 🔁 dead id → bound 0.1.5 (a402e1e); K3-verified | keymap.ts |
| Ctrl+O thinking density · Ctrl+S stash · Ctrl+C quit-confirm | 0.1.1 | ✅ | |
| Ctrl+R history search · Ctrl+J changelog | 0.1.5 | ✅ | |
| Esc Esc clear · Esc Esc Esc rewind | 0.1.1 / 0.1.5 | 🔁 triple unreachable → fixed 0.1.6 (detectors fed jointly) | runtime.ts |
| `.` keep-going · `!` bash mode · `/` autocomplete · `@` file completion | 0.1.4/0.1.5 | ✅ | |
| Mouse (wheel/drag-select/scrollbar/URLs) | 0.1.5 | ✅ | feature-gated |

## Agent tools

| Feature | Introduced | Status | Anchor / note |
|---|---|---|---|
| `read_file` `list_files` `grep` `glob` | 0.1.1/0.1.5 | ✅ | floor-enforced; cycle-safe 0.1.6 |
| `web_fetch` | 0.1.5 | ✅ | timeout + cap + caller abort 0.1.6 |
| `todo` | 0.1.5 | ✅ | shared task list |
| `hashline_edit` | 0.1.5 | 🔁 ungated at ship → gated in E012 (0.1.5 patch line) | hashline.ts |
| `task` | 0.1.5 | ✅ | K3 lifecycle + schema + provider fixes 0.1.6 |
| `task` steering channel (`steerChild`/`activeChildren`, `sessionId` in result details) | 0.1.7 | ✅ | task.ts — the E017-restored known-list channel |
| `lsp` | 0.1.5 | ✅ | confined + per-cwd clients 0.1.6 |
| `write_file` `edit_file` `bash` (gated trio) | 0.1.1 | ✅ | previews, floor, abort/timeout |
| MCP proxies | 0.1.5 | 🔁 replaced built-ins at ship → merge + gated + scrubbed env (E012) | mcp.ts |

## Chrome & UX behaviours

| Feature | Introduced | Status | Anchor / note |
|---|---|---|---|
| **Brand splash (shimmer)** | 0.1.1 once-ever; 0.1.5 every-launch | 🔁 **dropped in b50232d (mouse edit), restored 0.1.7 (this epic)** — 82-frame pty-verified | brand.ts + runtime.ts |
| Two-sided status line + chip sets + presets | 0.1.4/0.1.5 | ✅ | status.ts |
| Busy chip (braille + action + elapsed) | 0.1.4 | ✅ | |
| plan chip · bash `$` chip · autonomy chip · git/ctx chips | 0.1.5 | ✅ | |
| Theme auto-detect (OSC 11 / COLORFGBG) | 0.1.5 | ✅ | theme.ts |
| In-TUI sign-in overlays (OAuth device + key entry) | 0.1.5 | ✅ | signin.ts / oauth.ts |
| **Keyless boot + provider fallback** | 0.1.6 | ✅ | runtime.ts; pty-verified |
| Permission overlays with inline diffs | 0.1.1 | ✅ | sanitised 0.1.2+ |
| Permission overlay always-stops: `Always (session)` vs `Always (this project)` — the project stop persists `tools.approval.<tool> = "allow"` | 0.1.7 | ✅ | tui/permission.ts + config.ts (E017 pick 7) |
| Settings routing tab: read-only per-tool approvals summary row | 0.1.7 | ✅ | settings.ts → config.json `tools.approval` |
| Magic keywords: `ultrathink` (fusion think panel) + `ultrareview` (multi-model diff review) — composer shimmer, hidden notice, settings interaction toggle | 0.1.7 | ✅ | tui/magic-keywords.ts + composer.ts + app.ts runUltraTurn |
| Mouse-sequence input guard (SGR/URXVT-1015/X10 swallowed before components) | 0.1.9 | ✅ | tui/mouse-guard.ts wired into runtime.ts listener (E019 inc 02) |
| Opaque overlays | 0.1.5 | ✅ | |
| Attention notifications (focus-aware) | 0.1.1 | ✅ | attention.ts |
| Role pills (per-agent identity) | 0.1.1 | ✅ | transcript.ts |
| Tier chip + transition notice (routing visibility) | 0.1.7 | ✅ | status.ts + app.ts applyRoutingEvent (E017 S1) |
| Fusion role-pill blocks + gate verdict notices | 0.1.7 | ✅ | transcript.ts + app.ts renderGateOutcome (E017 S1) |
| Terminal crash guard | 0.1.7 | ✅ | uncaughtException/unhandledRejection restore the terminal (alt-screen/raw) + print the error — a TUI crash can never wedge the terminal again |
| Chip overflow policy | 0.1.7 | ✅ | status line drops low-priority chips (git→ctx→provider→…) before truncating; right side (tokens+model) never loses |
| Session-name header bar | 0.1.7 | ✅ | top-of-chat label showing the /rename name (Claude Code style); dim short id when unnamed |
| `/rename` | 0.1.7 | ✅ | names the session; persists via session_name entry; /resume picker + /sessions show it |
| Daily tips | 0.1.5 | ✅ | feature-gated |
| Auto-compact at 80% | 0.1.5 | ✅ | idle-only 0.1.6; LLM-summarising swap (transport.compactSession, incremental summary) 0.1.7 — onAutoCompact tier hook preserved |
| Steer-while-busy (typeahead steering) | 0.1.7 | ✅ | busy submit routes to transport.steer; dim `→ steering` suffix; persisted as a user entry (E017 pick 2) |
| Word-level diff rows | 0.1.7 | ✅ | diff.ts renderDiff: paired -/+ inverse word highlights (pure-JS LCS, no diff pkg), stable 3-digit gutter, blanked repeats (E017 pick 3) |
| Bracketed-paste decode + NFC | 0.1.7 | ✅ | tui/paste.ts: csi-u + xterm control-byte decode upstream of the editor (E017 pick 4) |
| Atomic-token backspace | 0.1.7 | ✅ | composer.ts: cursor inside an unregistered paste marker deletes it whole (E017 pick 5) |
| History search highlight + age labels | 0.1.7 | ✅ | history-search.ts: per-token accent ranges + now/Nm/Nh/Nd/Nw/Nmo/Ny (E017 pick 6) |
| Session search picker (`/resume`) | 0.1.7 | ✅ | session-search.ts: fuzzy tokens + quoted phrases + re: regex, relevance + recency tie-break (E017 pick 5) |
| Fork-from-message picker | 0.1.7 | ✅ | fork-picker.ts over store.listUserMessages/forkAtEntry; picked text restored to composer (E017 pick 3) |
| Live task progress rows | 0.1.7 | ✅ | transcript.ts consumes tool_update partials: `● task: prompt · N tools · current tool`; settled keeps the stats line (E017 pick 6, contract #3) |
| Mermaid→ASCII | 0.1.5 | ✅ | mermaid.ts |
| Prompt stash + frecency history | 0.1.1 | ✅ | stash.ts |
| Goal lifecycle on boot card | 0.1.5 | ✅ | goal.ts |
| Boot capability row + memory surface | 0.1.5 | ✅ | app.ts |
| Settings routing tab (posture quality/balanced/saver cycling + read-only pins summary → `config.shift`) | 0.1.7 | ✅ | settings.ts + config.ts (`writeShiftPosture`) |
| Guided teaching turn in first-run | 0.1.1 | ❌ retired 2026-08-19 (CTO) — `/setup` + keyless boot is the onboarding path | E002 Inc 03 |

## Backend capabilities

| Feature | Introduced | Status | Anchor / note |
|---|---|---|---|
| SessionTransport + event protocol (v2) | 0.1.1 / 0.1.5 | ✅ | transport.ts |
| JSONL v3 session trees | 0.1.1 | ✅ | resume/lock/defensive parse 0.1.6 |
| Cortex checkpoints + SSE | 0.1.1 | ✅ | redacted; watermark 0.1.6 |
| Provider substrate (30+ lanes + OAuth) | 0.1.1 | ✅ | persistent store universal 0.1.6 |
| Ollama lanes (`ollama` keyless local, `ollama-cloud` OLLAMA_API_KEY; dynamic discovery via /api/tags) | 0.1.7 | ✅ | core ollama.ts, registered in `defaultModels()` |
| Provider table completeness (E017 pi-ai catalogue diff: +huggingface, baseten, google-vertex, cloudflare×2, opencode×2, ant-ling, minimax-cn, moonshotai-cn, zai-coding-cn, qwen×2, xiaomi×4; **deliberately skipped:** amazon-bedrock ambient AWS auth, azure-openai-responses per-resource base URL) | 0.1.7 | ✅ | cli providers.ts + `SKIPPED_PROVIDERS` |
| Fusion FU-1..FU-5 (panel/synthesis/gate/policy/telemetry) | 0.1.1 | ✅ | K3-hardened 0.1.6 |
| Synthesis compare-then-compose + judge selection + parse-failure fallback | 0.1.7 | ✅ | OK-9 W4 (LLM-Blender pairwise; judge ≠ panel member; panel survives a broken merge) |
| Bandit routing (per-bucket posteriors) | 0.1.1 | ✅ | reward wiring = E017 inc 06 |
| Casts | 0.1.5 | ✅ | operator casts 0.1.6 |
| Shift (stage routing + tier scorer) | 0.1.5/0.1.6 | ✅ | composition wiring = E017 inc 02 |
| Orchestration facade (`shift.posture`/`shift.pins` config, tier latch, gate-cap cascade retry, gate→bandit reward writeback) | 0.1.7 | ✅ | core orchestrate.ts; fuse.ts on the facade |
| LLM-summarising compaction engine (`SessionTransport.compactSession(previousSummary?)` → `{summary, before, after}`; structured checkpoint + incremental UPDATE; `findCutPoint`/`keepRecentTokens` retained tail) | 0.1.7 | ✅ | local-transport.ts over pi-agent-core `generateSummaryWithUsage` (E017 contract #1) |
| Session fork-at-entry (`store.listUserMessages()` + `store.forkAtEntry(entryId)` — root→entry path copied to a fresh session id, re-anchored parentIds, `parentSessionId` provenance) | 0.1.7 | ✅ | session-store.ts (E017 contract #2) |
| Task live progress channel (tool `onUpdate` partials `{status, currentTool?, toolCount, turnDepth, sessionId, elapsedMs}` → `SessionEvent` kind `tool_update`) | 0.1.7 | ✅ | task.ts + events.ts (E017 contract #3) |
| Permission engine + deny floor | 0.1.1 | ✅ | floor extended 0.1.6 (F10 closed: `.ssh` node denied) |
| Persisted per-tool approval policy (`tools.approval.<tool>`: allow/deny; consulted deny-floor → config override → autonomy → session always-cache → ask) | 0.1.7 | ✅ | permission-gate.ts + config.ts (E017 pick 7; revisits session-only `always`) |
| Headless approval path: `chat` runs the gate; `ask` auto-rejects with an actionable error (tool, config key, autonomy alternative) | 0.1.7 | ✅ | chat.ts `headlessApprovalError` (omp no-UI pattern) |
| Shadow-git undo | 0.1.1 | ✅ | GIT_* scrub + gitignored capture 0.1.6 |
| Secrets redaction at all write seams | 0.1.2 | ✅ | |
| Hub/bridge listener hardening | 0.1.5/0.1.6 | ✅ | http-common.ts |
| Upgrade trust root | 0.1.1 | ✅ | release-key pin = E017 inc 09 |
| Temporal-decay memory scoring · SONA mining · semantic tool cache | — | 📋 KOS-side, post-v1 by design (E001 Inc 07) | not standalone blockers |
| KOS lane-driver skeleton | — | 📋 kaidera-os repo, outside this tree | E001 Inc 08 |

---

## Regression ledger (what was dropped when — the record the user asked for)

| Feature | Dropped in | Found | Restored | Lesson |
|---|---|---|---|---|
| Brand splash (shimmer) | b50232d (mouse-feature edit removed the `playBrandAnimation` call; import survived) | CTO report 2026-08-19 | 0.1.7 (this branch) | A call-site deletion compiles clean and passes every test. **Visual/boot features need a registry check, not just a suite.** |
| Ctrl+K palette | never bound (type-only id) | TuiLayer2 (E012 review) | 0.1.5 line | Declared ≠ defined. |
| Triple-Esc rewind | mutually exclusive detectors | TuiLayer2 | 0.1.6 | Gesture grammars need an interaction test. |
| `/model <id>` arg path | duplicate case label | TuiLayer2 | 0.1.6 | no-duplicate-case class. |
| OAuth persistence | in-memory store default | SecNetSecrets (E012) | 0.1.5 line | "stored" must mean survives restart. |

## Process rule (standing)

1. **Every feature PR updates this registry** (new row, or status change with reason).
2. **Release gate:** the registry audit is part of E017 inc 10 acceptance — walk every ✅/🔁 row; evidence in the release notes.
3. **Drops are decisions, not accidents:** a ❌ row needs a named decision-maker and rationale in this file at the time of removal.
