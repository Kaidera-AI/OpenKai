# OpenKai Test Guide — per-functionality UAT drives

Run everything against the dev binary: `openkai-next` (or `node packages/cli/dist/index.js`).
Each drive lists steps + what you MUST see. Report anything that differs.

## 1. Turn lifecycle (the aliveness surface)

1. Launch the TUI. **See:** the boot card (brand mark + capability row + tip).
2. Type `hello` and Enter. **See:** the boot card collapses to one compact line;
   your message under `You`; a shimmering activity label in the status line
   (`⠋ writing 1s` style) — it must be visibly ANIMATED.
3. While the model works: **See** the status line name the current step
   (`thinking` / `writing` / `tool: <name>`), and the elapsed seconds tick.
4. If the model thinks: **See** a `✻ thinking…` row with a moving starburst and
   a live char count; Ctrl+O reveals the reasoning.
5. When the turn ends: **See** `✓ settled in Ns · ↑in ↓out · ⚡tok/s` and the
   status returns to `○ idle`. If instead it errors, an error row appears and
   the status settles — a finished turn and a crashed turn never look alike.

## 2. Tools & permissions

1. With access level `off` (default), ask: `create a file test.txt with hello`.
   **See:** a permission overlay with a diff preview; options once/always/reject.
2. Approve once. **See:** the write tool card run and settle `✓ done`.
3. Ask it to `delete test.txt` then REJECT at the overlay. **See:** a red
   `permission denied: bash — <command>` row naming the reason + where to change
   it (`/autonomy`, settings → routing, config).
4. Ask it to write to `~/.zshrc` (outside the folder). **See:** refusal with
   `path outside working directory` — NO overlay, no approval possible.
5. Ask it to write `.env`. **See:** protected-path floor refusal.

## 3. Access levels

1. `/autonomy` — **See:** four plain-language levels: ask every time / trusted
   reads / trusted folder / full access.
2. Pick `high — full access`, then ask for a bash run (`run ls -la`).
   **See:** no overlay; the bash card runs immediately.
3. Back to `off` via settings → interaction → access level. **See:** the status
   line autonomy chip change.
4. `/settings` → routing tab: **See** the read-only per-tool policy summary.

## 4. Magic keywords

1. Type `ultrathink` (not submitted). **See:** the word shimmers in rainbow as
   you watch. In `code ticks` it does not.
2. Submit `ultrathink what breaks if I cache this`. **See:** a multi-model
   think panel (architect + builder outputs, then a combined verdict); the
   status line shimmers `ultrathinking…`.
3. Make an edit in the repo, then `ultrareview the last change`. **See:** the
   multi-model review of your diff. On a clean tree: the honest
   `nothing to review` notice.
4. Settings → interaction → magic keywords: cycle through all/think/review/off
   and confirm the toggle persists (quit, relaunch).

## 5. Mouse

1. Type a line of text in the composer; click mid-word. **See:** the cursor
   jumps to the click point; typing inserts there.
2. Drag across transcript text. **See:** selection highlights; release copies
   (paste somewhere to confirm).
3. Move the mouse anywhere. **See:** NO stray digits appear anywhere, ever.
4. Wheel over the transcript scrolls; the scrollbar drags.

## 6. Models, providers, fusion

1. `/model` — **See:** provider list with key status (✓ via KEY / OAuth lane /
   keyless), then a model list with context + cost.
2. `/settings` → providers → Enter on an OAuth lane (no key set). **See:** the
   device-flow overlay (URL + code). Esc cancels cleanly.
3. `/fuse write a haiku about caches` — **See:** two role-pilled outputs and a
   combined verdict. `/fuse` bare → the menu.
4. `/shift` after a few turns — **See:** routing decisions with tier + source +
   reason (empty ledger says so honestly).

## 7. Sessions

1. `/rename my test session` — **See:** the header bar above the composer.
2. `/new`, then `/resume` — **See:** the searchable picker lists the named
   session; Enter restores it.
3. `/tree` and `/fork` — **See:** the branch structure; fork rewinds to a picked
   message.
4. `/export` — **See:** the HTML path notice; open the file in a browser.

## 8. Served TUI (hub)

1. `OPENKAI_HUB_TOKEN=test openkai serve` (or `openkai hub`), then
   `curl -H "Authorization: Bearer test" -X POST localhost:4099/sessions -d '{}'`.
   **See:** a sessionId + attach path.
2. Attach a client (docs/attach-protocol.md), ro mode. **See:** the settled
   frame, then live frames. rw mode: input drives the session.
3. Ctrl+C the hub with an attach open. **See:** it exits cleanly (no hang).
4. `/settings → features → mouse support → off` — **See:** mouse traffic stops
   affecting the UI entirely.

## 9. Crash guard

1. If the TUI ever crashes: **See** the terminal restores itself and a full
   stack prints to stderr — `openkai crashed (terminal restored): …`. Send that
   stack verbatim with any bug report.
