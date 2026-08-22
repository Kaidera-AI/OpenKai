# OpenKai UAT Plan — v0.01.001 line

> **SUPERSEDED for 0.1.9+** by `docs/TEST_GUIDE.md` (2026-08-20). Kept for the 0.01.001-line record.

**Purpose:** physical acceptance testing you drive. Each scenario lists steps + what you should SEE. Anything that deviates is a finding — note it and it becomes a handoff.

**Setup (once):**
```bash
brew update && brew upgrade openkai   # or: brew install kaidera-ai/tap/openkai
openkai --version                      # expect 0.1.3+
openkai info                           # self-check: providers, catalogue, local state
```
Keys resolve from `~/.openkai/.env` (already populated). OpenRouter's free daily cap may be exhausted; the **nvidia** lane is the reliable one today: add `--provider nvidia --model meta/llama-3.1-8b-instruct` to any TUI command, or set `OPENKAI_PROVIDER=nvidia` + `OPENKAI_MODEL=meta/llama-3.1-8b-instruct` in `~/.openkai/.env` to make it the default.

**Watch the machine think (second terminal):**
```bash
cd /same/directory/as/the/tui && openkai tail -f
```
Shows: turn started → tool calls with args → results → token counts → turn complete.

---

## S0 — First run
1. `openkai` in a fresh terminal.
2. **First run ever**: the Kaidera hex + OpenKai wordmark animation plays once (~1s), then the app.
3. **Every later run**: one compact brand line at the top: `OpenKai <v> · by Kaidera — /help…`.
4. Status line at the bottom always shows: `[OPENKAI] · model · session · tokens · p:local · provider · state`.

**Pass:** animation plays once only; brand line present; chrome always visible.

## S1 — Liveness (your reported bug)
1. Submit: `tell me a short joke`.
2. While it works, the status chip animates: braille spinner + activity + elapsed seconds (`⠹ writing 2s`).
3. The turn completes; the app STAYS OPEN (0.1.3 fix); submit a second message — it answers too.

**Pass:** visible activity during the turn; app alive after two turns.

## S2 — Discoverability
1. Type `/` in the composer — a command menu appears with descriptions; arrow through it; Enter picks.
2. Type `/he` — the list narrows (fuzzy).
3. `Ctrl+K` — the command palette opens; type `mod` — model actions filter in.
4. `@` + a few letters — file paths complete.

**Pass:** you never need to know a command exists in advance.

## S3 — Model + provider control
1. `/model` — the provider list opens, showing per-provider state (key configured / no key / subscription).
2. Enter on `nvidia` — its model catalogue opens; filter `llama`, pick `meta/llama-3.1-70b-instruct`.
3. The chrome's model chip changes; a notice confirms the switch. Ask something; it answers on the new model.
4. `/effort` — cycles off → minimal → low → medium → high (notice each time). `/fast` — toggles effort off/on.

**Pass:** mid-session model switch works; effort/fast visible in notices.

## S4 — Tools + permission engine
1. Submit: `create a file called uat-test.txt with the word hello in it`.
2. A permission overlay opens with the diff; footer shows `↑/↓ Navigate · Enter Select · ESC Cancel`.
3. Choose **Allow once**. The tool card settles `✓ done`; the file exists on disk.
4. Submit: `read .env` — refused with `denied — protected path` (no prompt at all; the floor is terminal).
5. `/undo` — restores the tree; `uat-test.txt` is gone.
6. `openkai undo --history` lists the snapshots.

**Pass:** overlay renders + decides; floor refuses secrets; undo restores.

## S5 — Fusion
1. `/fuse design a rate limiter for an API` — two role blocks render ([ARCHITECT]/[BUILDER] pills), then the synthesis block (consensus / divergences with attribution / blind spots).
2. CLI: `openkai fuse --prompt "two rules for good errors" --provider nvidia --architect-model meta/llama-3.1-8b-instruct` prints both roles + synthesis.
3. With `--gate`: the designed checks print and the run REFUSES without `--yes` (consent parity).

**Pass:** attribution tags present everywhere; gate refuses without explicit consent.

## S6 — Sessions
1. In the TUI: `/sessions` lists local sessions; `/new` starts fresh; quit, then `openkai tui --session <id>` replays the transcript.
2. `openkai sessions` and `openkai sessions --show <id>` on the CLI.

**Pass:** resume replays the conversation exactly.

## S7 — Memory modes
1. Default here: `p:local` chip; sessions persist under `.openkai/sessions/` only.
2. `CORTEX_PROJECT=openkai openkai` — chrome shows `p:openkai`; after a turn, the session id appears in Cortex (`openkai events --print` shows started/stopped live).

**Pass:** both modes honest; managed mode actually checkpoints.

## S8 — Upgrade paths
1. `openkai update --check` (alias works) — brew installs print the brew guidance (Homebrew owns the binary).
2. `brew upgrade openkai` when a release lands.

**Pass:** no self-mutation of a brew install; correct guidance per channel.

---

## Findings log (fill as you go)

| # | Scenario | What happened | Expected | Severity |
|---|---|---|---|---|
| 1 |  |  |  |  |
