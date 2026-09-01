# Handoff: kai@kaidera-os → kai@openkai — TUI compatibility with the KOS terminal lane

**Date:** 2026-09-01 · **Authority:** standing cross-project comms exemption (CTO
2026-08-15), reaffirmed by CTO directive 2026-09-01: "findings to improve should go to
openkai project lead kai@openkai as handoffs." Delivered as a repo document because the
`openkai` project is not registered in the kaidera-os Cortex instance.

## The goal

Make `openkai tui` a first-class **persistent PTY harness** in the KOS console terminal
lane (design 22), so OpenKai agents get the byte-fidelity terminal instead of the classic
parsed chat feed — which today they alone fall back to (`openkai-terminal-disabled`).

## What KOS verified already

- `openkai` v0.1.9 ships the pi-tui alt-screen TUI (`openkai` bare == `openkai tui`).
- The KOS terminal lane already runs claude-code and omp as persistent TUIs: ONE live
  process per (project, agent, session) under a real PTY; raw bytes append to a
  per-session log; the UI replays + tails byte-for-byte; sends write sanitized text + CR
  to the PTY (the TUI echoes it). New: flag-gated direct keystroke input (CTO go
  2026-09-01).
- OpenKai is the **only** harness missing from `builders.terminal_argv`. The disabled
  policy was written for the *headless embedded* lane — but the host has a TUI.

## Five asks

1. **PTY submit:** can `openkai tui` accept a message written to its PTY stdin followed
   by CR as a normal submit — no synthetic prompt-echo needed?
2. **Session pinning:** the supported flag/env to bind one TUI process to a stable
   session id per (project, agent, session) so KOS can resume (`.openkai/sessions/`
   exists — is there `--session <id>` / a `--session-dir` equivalent like omp's?).
3. **Alt-screen replay:** KOS replays the FULL byte history on reconnect — confirm the
   TUI's alt-screen init sequences are replay-safe (claude-code's are).
4. **Headless vs TUI:** the appliance embeds OpenKai headless (API-key lane). Can the TUI
   run against the same embedded core config, so the appliance console gains the terminal
   surface too — or state the constraint plainly.
5. **Cortex checkpointing:** `openkai chat` checkpoints sessions to Cortex — confirm the
   TUI does the same, so KOS's LTM segment flush does not double-ingest.

6. **Native theme (added 2026-09-01, CTO priority):** does `openkai tui` support an
   explicit light/dark theme — flag, env, or config — so KOS can spawn a session matching
   the app theme? If not, please add one: KOS is moving to a *session theme contract*
   (theme fixed at spawn; the terminal canvas renders to match the session), and the TUI
   choosing its own colors for the wrong background is the exact bug this replaces.
   Honouring `COLORFGBG` and/or querying OSC 11 at startup would also serve adaptive
   default behaviour.

Also name the **minimum OpenKai version** carrying these guarantees (KOS vendors
`0.1.9-uat.0`; the local host runs 0.1.9 via bun + npm link).

## What happens next on the KOS side

Once 1–3 are confirmed: `builders.terminal_argv` gains the openkai entry, the disabled
policy is lifted for host mode, and it is proven with a live typed round-trip in the
terminal panel. Reply as a handoff back to kai@kaidera-os.
