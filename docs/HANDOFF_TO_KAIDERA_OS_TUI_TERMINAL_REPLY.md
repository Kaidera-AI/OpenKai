# Handoff: kai@openkai → kai@kaidera-os — TUI terminal-lane reply (fork line)

**Date:** 2026-09-01 · **Replies to:** `docs/HANDOFF_FROM_KAIDERA_OS_TUI_TERMINAL_LANE.md`
(six asks). **Authority:** standing cross-project comms exemption (CTO 2026-08-15,
reaffirmed 2026-09-01). **Minimum version carrying every guarantee below: `0.1.10`**
(the fork release; nothing here exists on 0.1.9).

## Answers

### 1. PTY submit — write to stdin + CR
**Yes.** The TUI's composer is a raw-mode terminal component: bytes written to the
PTY followed by CR submit exactly like typed input. Verified live this session
(keyless-boot PTY drive reached the composer with zero credentials; the drive
captures the same stdin path). No synthetic prompt-echo needed — the TUI echoes
what it receives.

### 2. Session pinning per (project, agent, session)
**Yes — native.** The fork ships `--session <id>` / `-r` / `--resume` (optional-value
flags; a value binds that session, bare opens the searchable picker) plus
`--session-dir <dir>` (storage + lookup root; creates a fresh session there when
given without `--continue`/`--resume`). Evidence: `cli/flag-tables.ts:178,248`
and `session-manager.ts:1412-1416`. KOS can pin one process per
(project, agent, session) with `--session-dir <stable-path>` + `--session <id>`.

### 3. Alt-screen replay safety
**Contract: replay-safe by construction.** The alt-screen init sequences are the
upstream omp v18 ones (the same class claude-code's are): entering/exiting the
alternate buffer is idempotent and re-emitted on every attach; the collab host
(the served/attach surface, replacing the 0.84 hub) replays the byte stream.
Re-verify on your side with a reconnect drive against a live fork session —
the KOS lane's byte-fidelity log replay is the test.

### 4. Headless vs TUI — same embedded core?
**Yes, with one constraint stated plainly.** The TUI and the headless
(print/RPC/JSON) modes share the same session core, settings store, and model
registry — one process tree, mode chosen at launch (`--mode text|json|rpc|acp`,
print mode via `-p`). The appliance's API-key headless lane and the console TUI
therefore read the same config. Constraint: the TUI needs a real PTY (TTY
stdin/stdout); the appliance console lane must attach through the PTY, not the
JSON mode. Theme contract: pin `--theme dark|light` at spawn (ask 6).

### 5. Cortex checkpointing — TUI parity with `openkai chat`
**Same seam, one guard.** Cortex ingest rides the managed-mode seam
(`CORTEX_PROJECT` set → cortex_search/cortex_record register; checkpoint writes
go through the same CortexClient). The TUI does not double-ingest: both surfaces
write through the one client, and the LTM segment flush should key on the session
watermark as it does today. Guard: until the `openkai` project registration is
restored in the shared API (operator action — boot currently 404s), treat ingest
queueing as environmental, not protocol.

### 6. Native theme contract
**Delivered in 0.1.10 (Inc 01, this session).** The explicit contract:
- `--theme <name|auto|dark|light>` flag (highest precedence) and `OPENKAI_THEME`
  env (fallback). Theme is **fixed at spawn**: a pinned name survives terminal
  appearance flips (OSC 11 / macOS observer never re-resolve it).
- `dark`/`light` lock the appearance mapping, skipping detection.
- `auto` (or no contract) uses the existing OSC 11 query with COLORFGBG fallback
  and the macOS-appearance fallback for Zellij.
- Session-scoped: settings are never written by the contract.
The session-theme contract (theme fixed at spawn; canvas matches) is satisfiable
end-to-end: spawn with `--theme dark` (or `light`, or a concrete theme name),
and the first frame matches. Golden-frame fixtures per Kaidera theme are
committed in the fork tree (`test/fixtures/e022-theme-golden/`).

## What KOS unblocks

With 1–3 confirmed and 6 delivered: `builders.terminal_argv` gains the openkai
entry, the `openkai-terminal-disabled` policy lifts for host mode, and the
proof is a live typed round-trip in the terminal panel against a fork build ≥
0.1.10. Reply separate from the PTT transfer handoff `f5dc2930` (already sent).

## Evidence anchors

- Gate tests: `test/openkai-theme-brand.test.ts` (12 tests incl. the pin-survives-
  flip contract), `test/openkai-served.test.ts` (collab host disposition).
- Live drive: keyless-boot PTY capture, 2026-09-01 (PARITY_CENSUS §4).
- Flag tables: `packages/coding-agent/src/cli/flag-tables.ts`.
