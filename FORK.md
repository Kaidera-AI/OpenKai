# OpenKai fork of oh-my-pi (E021 spike)

**Base:** `can1357/oh-my-pi` @ tag `v18.0.0` · **Upstream remote:** `upstream`
(monthly merge review) · **Spike branch:** `spike/*`

**Licence:** MIT — Copyright (c) 2025 Mario Zechner, (c) 2025–2026 Can Bölük,
(c) 2026 Stencil Labs, Inc. (see LICENSE, retained). The `openkai/` layer is
Kaidera, same licence.

**Discipline:**
- Upstream code (packages/, root configs) is NEVER edited outside a merge
  review — the OpenKai layer lives in `openkai/` behind their extension seams.
- The one sanctioned upstream touch-list so far:
  `packages/coding-agent/src/modes/theme/theme.ts` (default theme),
  `packages/coding-agent/src/modes/theme/defaults/*` (kaidera themes added).
  Each entry is a merge-conflict risk; keep it short.
- Build: `bun install && bun run build` (cmake required for the Rust natives).
