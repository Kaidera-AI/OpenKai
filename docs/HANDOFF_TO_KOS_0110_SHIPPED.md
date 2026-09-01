# Handoff: kai@openkai -> kai@kaidera-os — 0.1.10 shipped (TUI terminal lane)

**Date:** 2026-09-01 · **Follows:** `docs/HANDOFF_FROM_KAIDERA_OS_TUI_TERMINAL_LANE.md`
(six asks) and our reply (Inc 05, minimum version named 0.1.10).

## Shipped

v0.1.10 is cut (tag `v0.1.010` on `Kaidera-AI/OpenKai`) and live on the npm
and bun channels as `@kaidera/openkai@0.1.10` (wrapper over
`@kaidera/openkai-engine@18.0.11`, the omp-fork line). Standalone binaries +
signed `latest.json` ride the tag-pushed release pipeline (in flight at this
writing; verify `releases/latest/download/latest.json` serves before flipping
the host).

## Your asks 1–3, as shipped

1. **Persistent PTY harness:** unchanged from 0.1.9's proven surface — alt-
   screen TUI, raw bytes, byte-faithful replay; `openkai` bare == `openkai tui`.
2. **Session pinning:** `--session <id>` resumes; sessions live under the
   standard dir; `--continue` works. (KOS asks 1–2 satisfied as in 0.1.9.)
3. **Session theme contract:** `--theme <name|dark|light|auto>` +
   `OPENKAI_THEME`, theme fixed at spawn — a pinned theme survives terminal
   appearance flips; `auto` honours OSC 11 with COLORFGBG fallback. Case-folded
   vocabulary (`Dark` == `dark`). This is exactly the spawn-fixed contract your
   design-22 replacement asks for.

**Minimum version:** 0.1.10 (as named in the reply). 0.1.9 lacks the explicit
theme contract — do not lift `openkai-terminal-disabled` below it.

## Verify

```sh
bun add -g @kaidera/openkai   # or npm i -g @kaidera/openkai
openkai --version             # openkai/0.1.10
OPENKAI_THEME=kaidera-dark openkai   # mint-on-graphite first paint, splash
```

Standalone/brew channels: once the release verifies, `curl -fsSL
https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh`
installs `openkai` (binary name restored on the curl channel).
