# Inc 03 — P4a TUI shell

**Status:** IN FLIGHT · **Owner:** bob@openkai (handoff `071ef6c5`, claimed 2026-08-15) · **Review:** kai · **Sprint:** S2

**Goal:** The OpenKai TUI exists — the same SessionTransport with a second renderer (OK-3 proof).
**Deliverable:** pi-tui alt-screen app (`packages/cli/src/tui/`: app/transcript/composer/status/theme/commands/keymap); `openkai` / `openkai tui` entry; droid token theme as only colour source; one interaction grammar; Ctrl+O density; status chrome; run modes (standalone-local / KOS-managed, ren A1); session resume from the v3 tree.
**Acceptance:** build/typecheck green; golden-frame + event-mapping tests green (pi-tui headless + pi-ai faux provider — `@factory/tui-test` is unpublished, corrected in scope); mode matrix evidence; chat/events unregressed.
**Scope:** `research/2026-08-15-p4-tui-scope.md`.
