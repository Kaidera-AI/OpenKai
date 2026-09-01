# OpenKai fork of oh-my-pi (E021 spike)

**Base:** `can1357/oh-my-pi` @ tag `v18.0.11` (**pinned for E022** — merged
2026-09-01, zero conflicts; next merge post-release, monthly cadence) ·
**Upstream remote:** `upstream` · **Release branch:** `e022/*`

**Licence:** MIT — Copyright (c) 2025 Mario Zechner, (c) 2025–2026 Can Bölük,
(c) 2026 Stencil Labs, Inc. (see LICENSE, retained). The `openkai/` layer is
Kaidera, same licence.

**Discipline:**
- Upstream code (packages/, root configs) is NEVER edited outside a merge
  review — the OpenKai layer lives in `openkai/` behind their extension seams.
- The sanctioned upstream touch-list (each entry is a merge-conflict risk;
  keep it short):
  * `packages/coding-agent/src/modes/theme/theme.ts` (Kaidera default + the
    OpenKai explicit-theme contract: `--theme`/`OPENKAI_THEME`, E022 Inc 01)
  * `packages/coding-agent/src/modes/theme/defaults/*` (kaidera theme JSONs;
    `symbols.overrides` carries the ⬣ status-line glyph)
  * `packages/coding-agent/src/config/settings-schema.ts` (theme.dark/light
    default kaidera — the F1 first-paint fix; `startup.showSplash` default on)
  * `packages/coding-agent/src/cli/args.ts` + `cli/flag-tables.ts` +
    `commands/launch-help.ts` (`--theme` flag plumbing)
  * `packages/coding-agent/src/main.ts` (apply the theme contract before the
    first `ensureTheme`)
  * `packages/coding-agent/src/modes/components/welcome.ts` (brand mark =
    `openkai/brand` KAIDERA_MARK) and `modes/setup-wizard/scenes/splash.ts`
    (OpenKai wordmark)
  * `packages/coding-agent/src/modes/composer-cache.ts` (CACHE_VERSION 2 —
    invalidate pre-Kaidera prepaint caches)
- Build: `bun install && bun run build` (cmake required for the Rust natives;
  rustup nightly-2026-08-08 directory override — Homebrew rustc shadows rustup,
  so build with `PATH="$HOME/.cargo/bin:$PATH"` to honour the override).
