# Inc 00 gate evidence — upstream v18.0.11 merged + pinned (2026-09-01)

**Branch:** `e022/inc-00-upstream-sync` off `spike/f0-foundation` (= Kaidera-AI/OpenKai main @ `382afbaabd`)
**Merge:** `git merge --no-ff v18.0.11` — **zero conflicts** (touch-list discipline held; upstream touched only `theme-class.ts`/`tui-adapters.ts` additions + gallery fixtures, none of which overlap our 4-file theme delta or the `openkai/` layer).

## Evidence

```
$ git merge --no-ff v18.0.11 -m "Merge upstream v18.0.11 (E022 Inc 00 …)"
# clean, zero conflicts; tree shows new upstream files only

$ PATH="$HOME/.cargo/bin:$PATH" bun run build
# all workspaces exit 0 (pi-natives, pi-coding-agent, collab-web, stats,
# browser-relay, robomp-web) — PATH shim required: Homebrew rustc shadows
# the pinned nightly-2026-08-08 directory override otherwise (E0554 xutf)

$ cd packages/coding-agent && bun test test/openkai-*.test.ts
18 pass, 0 fail, 70 expect() calls — 10 files (registration, fusion,
shift, floor, served, keywords, fusion-recursion, rlm, rlm-display, retry)
```

## Pre-merge baseline (same session, unmerged tree)

- Build green, CLI smoke `omp/18.0.10` green (`--version`, `--help`).
- 18/18 gate tests green as found (70 expects, 5.3 s).

## v18.0.11 delta relevant to the epic

- Fix-batch release (137 commits): 402 credential rotation, sharpshooter
  memory-wipe guard, hyperlink policy live-applies, gix stale-index fixes,
  runtime-install lock crash-safety, MCP RFC 9728 probing.
- Gallery expanded (composer/segment preview fixtures) — irrelevant to the
  openkai layer.
- **No upstream change touches the openkai layer or its tests** (verified:
  `git diff v18.0.10..v18.0.11 -- packages/coding-agent/src/openkai/
  packages/coding-agent/test/openkai-*` is empty).

## Pin

FORK.md updated: base tag now `v18.0.11`, pinned for the remainder of E022
(no further upstream merges mid-epic; next merge post-release, monthly).

## Environment note (reproducible)

`bun run build` fails in pi-natives with `E0554 #![feature] on stable` when
`/opt/homebrew/bin` precedes `~/.cargo/bin` — Homebrew's stable rustc 1.98
shadows the rustup directory override. Fix: `PATH="$HOME/.cargo/bin:$PATH"`
(or export it for the session). Recorded in FORK.md.
