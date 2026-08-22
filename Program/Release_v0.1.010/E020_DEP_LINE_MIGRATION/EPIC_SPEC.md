# EPIC SPEC — E020: Dependency-line migration + OMP v18 fold-ins (v0.1.10)

**Epic:** E020_DEP_LINE_MIGRATION
**Release:** v0.1.10 (0.1.10 — ships ONLY on explicit CTO consent per docs/RELEASE_SOP.md)
**Owner:** kai@openkai (lead) · **lane: ren@openkai (CPO)**
**Opened:** 2026-08-22 (the day v0.1.009 shipped)
**Inputs:** OMP v18.0.0 release research (2026-08-22, handoff 120aa47f) · the namespace
migration trial run this session.

---

## 1. Goal

OMP's packages moved namespaces at v18.0.0: `@earendil-works/{pi-ai,pi-tui,pi-agent-core}`
0.84.2 (our pin) is the dead line; `@oh-my-pi/*@18.0.0` carries every future fix —
including the ones we want TODAY (streaming code-block highlighting, slow-terminal
backpressure gate, startup input handling). E020 migrates the dependency line and folds
the v18 capabilities that ride it.

## 2. The breaking-change map (built from the failed trial, typecheck evidence)

The trial (`@oh-my-pi/*@18.0.0` against our tree) typecheck-failed on **pi-ai's
restructured API** — the 0.84→18 gap spans the whole pi-17 line evolution, not just the
18.0.0 release notes:

| Our usage | 0.84.2 | 18.0.0 |
|---|---|---|
| `Models` (credentials.ts) | exported | REMOVED — registry reshaped (`AuthCredentialStore` exists) |
| `CredentialStore` / `Credential` / `CredentialInfo` / `AuthOperationOptions` | exported | renamed/moved (credentials subsystem restructured) |
| `contentText` (fusion/complete.ts) | exported | REMOVED |
| `uuidv7` (fusion/fuse.ts) | exported | REMOVED/moved |
| `createProvider` (ollama.ts) | exported | REMOVED — provider construction reshaped |
| `StreamFunction` (fusion ×4) | bare type | requires 1 type argument |
| `providers/all` subpath | resolvable | REMOVED |
| pi-tui `Editor.decorateText`, `EditorTextAssistProvider.tryAutocorrect`, macOS spelling fns | — | signature changes (UNUSED by us — verified zero callsites) |

pi-agent-core 18.0.0: no breaks (fixes only). pi-tui 18.0.0: breaks listed above, none
reachable from our tree.

## 3. What the migration buys (the v18 fold-in ledger)

| Capability | Source | Lands via |
|---|---|---|
| Streaming code blocks highlight LIVE (incremental) | pi-tui `MarkdownTheme.createHighlightStream` | migration + one-line adoption in transcript Markdown |
| Slow-terminal frame dropping (backpressure gate) | pi-tui `Terminal.pendingOutputBytes` + render gate | migration + adopt in runtime |
| Startup input hardening (`deferInput`/`enableInput`) | pi-tui TUIStartOptions | migration; NOTE: our keystrokes already survive boot (verified: TTY buffers them) — low value for us |
| Claude private-use glyph tokenization + SSE stranded-turn fix | pi-ai 18.0.0 | migration (free) |
| Agent identity-after-handoff fix | pi-agent-core 18.0.0 | migration (free) |

## 4. Folds that did NOT wait for the migration (landed on the 0.84 line)

- **`/shake thinking`** (OMP v18): strips reasoning blocks from context — shipped in
  the 0.1.9 dev line after the cut (lands in 0.1.10).
- **Startup composer:** evaluated and REJECTED — verified our TTY buffers early
  keystrokes into the composer (pty-tested); no dropped-keystroke window exists.

## 5. Deferred to E021+ (bigger than a fold)

- `openkai bench` (live benchmark dashboard: p50/p95, in/out throughput, cost) —
  design against our fusion telemetry + calibrate records.
- `openkai render` (session replay + pipeline benchmark).
- macOS spellcheck/autocorrect in the composer (pi-natives TextAssistProvider —
  evaluate after the migration when the seam exists).
- Hashline edit enhancements (＋-prefixed inserts, unified-diff payloads, sloppy
  fallback for weak models) — our edit tool is hashline-first; sloppy fallback is
  the valuable half.
- `tui.resizeScrollback` (append/rebuild/preserve on multiplexer width resize).
- In-place rewind truncation for /tree (no full scrollback replay).

## 6. Increments

| # | Increment | Deliverable | Acceptance |
|---|---|---|---|
| 01 | **Namespace migration** | `@oh-my-pi/*@18.0.0` across package.jsons + 67 files; the pi-ai API map applied (credentials/models/provider/stream/uuid/contentText) | typecheck + 467-suite + e2e + audit green on the migrated tree |
| 02 | **Live code-block highlighting** | transcript Markdown adopts createHighlightStream | e2e: a streaming fenced block shows syntax colour BEFORE the fence closes |
| 03 | **Backpressure gate** | runtime adopts pendingOutputBytes gate | slow-terminal drive: frames drop, input never lags |
| 04 | **Registry + changelog** | rows + 0.1.10 entry | matches shipped surface |

## 7. Risks

- The pi-ai API map is reverse-engineered from typecheck errors, not a migration
  guide (none exists) — every fix is a lookup against the new source; budget for it.
- The namespace rename is a hard cutover: any missed import string builds fine and
  fails at RUNTIME. The suite + e2e + a live smoke are the net.
