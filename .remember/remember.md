# Handoff

## State
OpenKai harness TUI (@openkai/cli 0.1.5) on `main` in ~/DevVault/OpenKai; all work pushed (0542545). 225/225 tests green. Live candidate rebuilt at `~/.local/bin/openkai-next` (rebuild after any change: `npm run build && packages/cli/scripts/build-binaries.sh bun-darwin-arm64 && cp packages/cli/bin/openkai-darwin-arm64 ~/.local/bin/openkai-next`). Done: omp gradient splash every launch (any-key skip, `openkai splash` replays), persistent gradient hex boot card, two-sided status line (⬢ glyph left, tokens+model right) with presets in /settings→appearance, in-TUI sign-in (OAuth overlay for Claude Pro/Max/Codex/Kimi/Copilot + key-entry overlay), /setup vs /settings split, /init (AGENTS.md generator), /memory (multi-agent append-only .openkai/memory), tabbed settings.

## Next
1. omp `/model` deeper study (model-browser/model-hub components in /tmp/omp-src) — lift what's good.
2. Enrich tips file from omp's curated tips.txt.
3. Keep cherry-picking omp functionality per CTO formula: functionality from omp, look+feel from droid.

## Context
CTO (Amad) tests via `openkai-next` in ghostty on the Mac; tmux captures can't render droid's composer but verify our TUI fine. omp source cloned at /tmp/omp-src (may be gone after restart — re-clone can1357/oh-my-pi if needed). pi-ai pinned 0.84.2 provides OAuth lanes + models.login. Cortex project `openkai` tracks decisions (kai@openkai, cortex-api:8501).
