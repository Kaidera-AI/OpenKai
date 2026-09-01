# INC 01 GATE — theme & brand completeness (2026-09-01)

**Fork commit:** `81c9a6e4d2` (+ CI-fixes `6dd1f30b6e`) · branch `e022/inc-00-04-tui-consolidation`

## Gate evidence (executable)

- `test/openkai-theme-brand.test.ts` — 12/12 green:
  - explicit theme contract: `--theme` flag > `OPENKAI_THEME` env > detection;
    pinned theme **survives terminal appearance flips** (the KOS ask 6 contract);
  - first-paint defaults: schema `theme.dark`/`theme.light` = kaidera (F1 fix —
    titanium can never resurrect via `Settings.get` fallback);
  - splash every launch: `startup.showSplash` default `true`; brand mark is the
    Kaidera hexagon; compact wordmark reads OpenKai; ⬣ status glyph rides both
    kaidera theme JSONs via `symbols.overrides`;
  - golden first frames: ANSI-stripped structure per theme vs committed fixtures
    (`test/fixtures/e022-theme-golden/`). Styled-byte comparison was dropped after
    CI proved it capability-dependent (truecolor vs 256-ramp escapes differ per
    terminal; structure + theme-drew assertions pin the contract instead).
- Live PTY keyless-boot drive: hexagon first paint, composer reached, zero
  credential noise (PARITY_CENSUS §4).
- Full suite: 30/30 gates green at commit; 93/93 after CI fixes.

## Touch-list additions (FORK.md)

`theme.ts` (contract), `settings-schema.ts` (defaults + splash), kaidera JSONs
(symbols), `args.ts`/`flag-tables.ts`/`launch-help.ts` (`--theme`), `main.ts`
(apply before first paint), `welcome.ts`/`splash.ts` (mark + wordmark),
`composer-cache.ts` (CACHE_VERSION 2 — no titanium flash from stale cache).

## CI lesson recorded

Golden frames must pin STRUCTURE (ANSI-stripped) when the styled output depends
on terminal capability detection; CI's ubuntu runner lacks COLORTERM → 256 ramp.
