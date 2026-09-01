# INC 02 — Parity census: FEATURE_REGISTRY (0.1.7 tree) vs the fork surface

**Date:** 2026-09-01 · **Basis:** fork @ `81c9a6e4d2` (E022 Inc 01) — 136 builtin
slash commands enumerated from `src/slash-commands/builtin-*.ts` + the openkai layer;
42 CLI subcommands in `src/commands/`; registry source: `Program/FEATURE_REGISTRY.md`.
**Disposition legend:** **match** (works on fork) · **adopt-omp** (upstream flow replaces
ours — equal-or-better recorded) · **port** (bring ours over via the openkai layer) ·
**retire** (reason + decision-maker).

## 1. Slash commands

| Registry row | Disposition | Evidence / reason |
|---|---|---|
| `/help` | match | native `help` (+ `/hotkeys`) |
| `/model [id]` | match | native `model` with arg-switch + picker |
| `/models` hub | adopt-omp | `models` is a native alias of `model`; hub component (`model-hub.ts`) + Ctrl+P cycling — richer than the 0.84 hub (scope/role filtering) |
| `/sessions` `/resume` `/new` | adopt-omp | native `resume` (searchable picker), `new`, `session info/delete/pin`; session names surface in the picker (native `rename`) |
| `/name <text>` | adopt-omp | native `rename` + `/session info` carry the name; picker + export show it |
| `/export [path]` | match | native `export` (HTML + raw) |
| `/exit` `/quit` | match | both native |
| `/btw` | match | native `btw` |
| `/undo` | **port** | no native equivalent; shadow-git undo is ours (registry ✅) — port via openkai layer or formal retire (CTO call, §5) |
| `/diff` | adopt-omp | native `/git` TUI: hunk/split/inline views, stage/discard — superset of the 0.84 read-only overlay |
| `/fuse [task]` | match | openkai layer (keywords-extension registers `/fuse`; panel executes directly) |
| `/retry [model]` | match | native `retry` (v18.0.10 tool-replay affordance) |
| `/fork` `/tree` | adopt-omp | native `fork`/`branch` + session tree (v3 parent links native) |
| `/autonomy` | adopt-omp | native approval model: `--approval-mode` (always-ask/write/yolo) + `tools.approvalMode` setting + per-tool approvals; picker UX drive-pending |
| `/plan` | match | native `plan` (+ plan-review overlay) |
| `/theme` | retire (standing) | CTO 0.1.7: themes live in settings; the fork's appearance tab + wizard scene honour that (Inc 01 wired the explicit contract separately) |
| `/goal` | adopt-omp | native `goal` + `guided-goal` |
| `/setup` | match | native setup wizard (scenes re-run in place) |
| `/settings` | match | native settings container (appearance tab carries themes with live preview — Inc 01 verified `previewTheme` wiring) |
| `/init` | **port-candidate** | no native `/init` (project memory file); `.openkai/memory` surface is ours — disposition with `/memory` below |
| `/memory` | match | native `memory` command (agent memory surface; agent-aware — Inc 02 priority row, drive-pending) |
| `/clear` `/copy` `/stats` `/context` `/compact` `/shake` | match | all six native (`shake thinking` native lifecycle) |
| `/login` `/logout` | match | native login-dialog + OAuth device flow + manual-key input (`oauth-manual-input.ts`); Claude subscription sign-in drive-pending (priority row) |
| `/features` | adopt-omp | superseded by `/hotkeys` + `/extensions` discovery |
| `/effort` `/fast` | adopt-omp | native thinking grammar (`/thinking`, `/fast`, `/auto`) covers effort levels |
| `/welcome` | retire (standing) | E005 decision, unchanged |
| `/rename` | match | native `rename` (Inc 02 priority row satisfied) |

## 2. CLI subcommands

| Registry row | Disposition | Evidence / reason |
|---|---|---|
| `openkai` / `tui` | adopt-omp | bare launch is the TUI (native); keyless-boot gate re-proven by drive (§4) |
| `chat --prompt` | adopt-omp | native `--print` (`-p`) non-interactive mode + headless approval path |
| `sessions` | adopt-omp | native resume picker at launch (`--resume`/`-r`/`--session` pinning — KOS asks 1–2 answered) |
| `events --print` (SSE bridge) | adopt-omp | collab host/relay (F3 disposition) is the attach path; the SSE bridge existed for the 0.84 KOS grid, which consumes collab now |
| `fuse` CLI (+`--cast`, `--gate`) | **port** | headless fusion invocation is ours; the layer carries the panel — port through a CLI seam or retire (CTO call, §5) |
| `fusion report/advise/dashboard/calibrate` | **port** | `calibrate` is ported in-layer (`openkai/fusion/calibrate.ts`); CLI exposure + report/dashboard: port in Inc 03 (gate: scorer-source assertion) |
| `undo [--history]` | **port** | rides the `/undo` shadow-git port (§1) |
| `login <provider>` | adopt-omp | native auth machinery (`auth-broker`/`auth-gateway` + in-TUI flows) |
| `tail [-f]` | retire-pending-CTO | activity feed rode the 0.84 ledger; on the fork, telemetry rides Cortex (managed mode) + collab — retire with CTO visibility or port |
| `info` | adopt-omp | `--version` + `/session info` + `/status` cover the self-check |
| `upgrade` / `update` | match + **port** | native `update` channel detection exists; our Ed25519 manifest + SHA-256 witness + release-key pin + rollback port is Inc 04 |
| `skills` `mcp` `statusline` | adopt-omp | native `/plugins`, `/extensions`, `/mcp` + configurable status-line segments |
| `serve` + served TUI | adopt-omp | collab host covers ro/rw attach (F3 gate, `openkai-served.test.ts`) |
| `bridge --listen` | adopt-omp | collab relay replaces the 0.84 bridge (K3-hardened equivalent upstream) |
| `splash` | retire (Inc 01) | the splash now plays every launch by default — a replay command is redundant |
| `help [topic]` | adopt-omp | native help + hotkeys |
| `version` | match | `--version` |
| `openkai provider` (single write path) | **port** | the atomic/comment-preserving provider-config write path KOS Settings shares — re-confirm on the fork in Inc 05 (KOS reply) |
| `openkai duet` / `openkai search` | retire (standing) | CTO 2026-08-19 decisions, unchanged |

## 3. Keybindings, tools, chrome & backend (summary)

| Area | Disposition | Note |
|---|---|---|
| Enter/Shift+Enter, `. ! / @` grammar, mouse suite, click-to-cursor, bracketed paste | match | native editor/input grammar (drive-pending rows in §4) |
| Ctrl+K palette | adopt-omp | native hotkeys + prompt-action autocomplete is the discovery surface; palette grammar drive-pending |
| Ctrl+O thinking · Ctrl+R history · Ctrl+J changelog · Esc grammar | adopt-omp | native equivalents (`/thinking`, native history search, `/changelog`, esc-esc navigation) — drive-pending |
| Ctrl+S stash | **port** | prompt stash + frecency is ours (registry ✅) — port or retire (CTO call, §5) |
| Agent tools (read/list/grep/glob/web/todo/task/lsp/write/edit/bash/MCP) | match | all native; the deny floor rides `gate-floor` (F3 gates green) |
| `hashline_edit` | adopt-omp | upstream's edit/apply_patch tools replace it (hashline stays in the hashline package for the edit-tool idiom) |
| task steering channel | match | native steering (steer-while-busy verified in upstream suite) |
| Splash/shimmer, status line + chips, busy/plan/autonomy chips | match/adopt | splash every launch (Inc 01, golden-gated); native segments + Kaidera ⬣ glyph |
| Theme auto-detect (OSC 11 / COLORFGBG) | match | native detection kept; explicit contract added (Inc 01) |
| In-TUI sign-in overlays | match | native OAuth + key entry; Claude subscription drive-pending |
| Keyless boot | **gate** | permanent gate — PTY drive with zero credentials in §4 |
| Permission overlays + denial naming | match | native engine + floor-extension denial rows (Inc 05 re-verifies) |
| Settings routing tab (posture/pins) | **port** | operator-priority UI = Inc 03 scope (OK-9.7) |
| Magic keywords (`ultrathink`/`ultrareview`) | match | keywords-extension (F3 gates green) |
| Attention notifications, role pills, crash guard, chip overflow | adopt-omp | native equivalents (notifications cmd, message frames, postmortem, segment shedding) |
| Tier chip + transition notice | match | shift-extension drives `ui.setStatus` on flips (F2 gates) |
| Fusion pills + gate verdicts, RLM display | match | layer renderers (F1/F4 + rlm-display gate) |
| Session-name header, daily tips, auto-compact, steer-while-busy, word-diff, atomic backspace, history highlight, session search, fork picker, live task rows, Mermaid, boot capability row | match/adopt | all covered natively or by the layer (drive-pending rows in §4) |
| Prompt stash + frecency | **port** | see Ctrl+S above |
| Boot-card goal lifecycle | adopt-omp | native `goal`/`guided-goal` |
| SessionTransport/JSONL v3/Cortex checkpoints | adopt-omp (transport) + **port** (checkpoints) | native session store; Cortex checkpoint ingest re-verified in Inc 05 (registration is an operator action) |
| Provider substrate (30+ lanes + OAuth, ollama lanes) | adopt-omp | native catalogue is a strict superset |
| Fusion FU-1..5, synthesis, bandit, casts, shift, orchestrate | match | the openkai layer (18/18 gates) |
| LLM compaction, fork-at-entry | adopt-omp | native (compaction summarises; fork/branch native) |
| Permission engine + deny floor, persisted approvals, headless approval | match | native + floor layer |
| Shadow-git undo | **port** | §1 |
| Secrets redaction | match | `openkai/secrets.ts` |
| Upgrade trust root | **port** | Inc 04 |

## 4. Drive-test ledger (automated vs operator)

Automated (test-verified this census):
- 18/18 E021 gates + 12 Inc 01 theme/brand gates green at `81c9a6e4d2`.
- `--theme`/`OPENKAI_THEME` contract: pinned theme survives appearance flips (test).
- Golden splash frames per Kaidera theme (fixtures committed).
- Session pinning seams: `--session`/`--session-dir` present in flag tables (grep evidence).
- **Live PTY keyless-boot drive (2026-09-01, operator-side):** `bun src/cli.ts` in a
  fresh `OPENKAI_HOME` with ZERO credentials → composer reached ("Welcome back!",
  tips panel, no auth error/401/block in the frame); the Kaidera hexagon mark renders
  in the welcome box first paint; splash frame rides the alt-screen (covered by the
  golden fixtures, not the capture). This is the permanent keyless-boot gate re-proven
  on the fork surface — registry row "Keyless boot" = match, drive DONE.

Operator drives (TEST_GUIDE checklist — each blocks the pre-publish walk):
1. ~~Keyless boot~~ — DONE (automated PTY drive above).
2. Claude subscription sign-in in-TUI; OpenAI + Kimi Code key entry.
3. `/model` hub navigation crash-free on a 24-row terminal (the 0.84 picker-crash regression drive).
4. `/autonomy` equivalent: approval-mode picker UX + persisted per-tool approvals.
5. Magic keywords shimmer + fusion routing live.
6. Mouse click-to-cursor + drag-select in the composer.
7. `/settings` theme picker live preview (restore on cancel).
8. Ctrl+R history search; esc-esc navigation grammar.

## 5. Port/retire decisions needing CTO visibility

| Row | Ask |
|---|---|
| `/undo` + shadow-git | port via openkai layer, or retire in favour of the `/git` TUI? (registry ✅ row — release-gated) |
| `fuse` CLI headless | port or retire (the TUI `/fuse` covers interactive use) |
| `tail -f` activity feed | retire (telemetry rides Cortex) or port |
| Ctrl+S prompt stash | port or retire |
| `openkai provider` write path | port — required for the KOS shared-config contract (Inc 05) |

## 6. Tally

- match: 34 · adopt-omp: 41 · port: 9 (3 already scoped to Inc 03/04/05) · retire: 7 (5 standing + splash replay + tail-pending)
- Every ✅/🔁 registry row has exactly one disposition. The five port-or-retire
  questions in §5 go to the CTO; ports not retired land before the pre-publish walk.
