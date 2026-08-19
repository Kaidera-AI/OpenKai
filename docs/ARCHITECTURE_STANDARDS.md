# OpenKai Architecture Standards (S-series)

**Status:** BINDING for OpenKai and KOS, adopted 2026-08-19 (CTO directive).
**Owner:** ren@openkai (CPO). Changes go through CPO review only.
**Scope:** everything that renders, mutates shared state, or crosses a product boundary (OpenKai ↔ KOS ↔ editors ↔ browsers).
**Why this exists:** two projects, one harness experience. These standards are how "one surface, one truth" survives contact with a second consumer — they are the design rules behind ADR OK-10 (served TUI) and the provider-config write path (consult 62e9a90e), generalised.

---

## S1 — One renderer, many consumers

Every surface is produced by exactly one renderer; consumers attach to it. There is never a second surface of the same thing (no parsed-HTML alternative, no reconstructed DOM, no "classic mode"). A new consumer attaches to the existing rendering — it never re-renders.

*Rule:* if a consumer can't see what the terminal sees, the answer is to serve the terminal — not to rebuild the content.

## S2 — Terminal seam law

No component touches `process.stdout`, `process.stdin`, raw escape sequences, or raw key input directly. All I/O goes through the terminal abstraction (`tui.start/stop`, the input listener, `terminal.write`). A terminal is a *backend*: TTY is one, a headless host is another, a browser attach is a third. Anything that breaks the seam works locally and garbles remotely.

*Test:* a component that can't run headless (render-to-string) doesn't ship.

## S3 — Replay-safe state

Every pixel derives from reconstructible state objects (transcript block lists, status state objects, overlay stacks) — never from terminal-local scratch. A settled frame must be reproducible from state alone, because attach-hello replays it. Animation is the only exempt surface; it degrades to a static frame, never to garbage.

*Rule:* state you can't reconstruct from an object is state you don't have.

## S4 — Explicit frame pump

Rendering is batched through one scheduler: state → frame, coalesced (≥30 fps per consumer), slow readers drop frames, the loop never stalls for a consumer. `requestRender` everywhere is not a scheduler; one exists or the code doesn't ship.

## S5 — Scoped input

Every input channel carries a scope (read-only / read-write). Read-only attaches never inject input — enforced at the seam, not by convention. A watch token can never become a write token by construction.

## S6 — Structured state beside byte streams

Cheap status (busy, tier, plan, error) travels as typed events *next to* byte streams — never extracted by parsing ANSI. Consumers that need state subscribe to events; consumers that need pixels read frames. One channel per concern, no cross-decoding.

## S7 — One mutation path per shared store

Every shared store (credentials, config, sessions) has exactly one code path that mutates it — atomic, permission-pinned, ordered/comment-preserving where the format allows. Two editors of one file is a race by construction; "configure it anywhere, same thing" is true by *one* code path, not by convention. (Shipped instance: `provider-config.ts` — TUI, CLI, and KOS Settings share it.)

## S8 — Product independence

OpenKai runs complete with zero KOS/Cortex presence. Integration means KOS *consumes* OpenKai's served surfaces; KOS never co-owns them, and OpenKai never carries KOS-specific code. Every crossing is a documented contract with an owner.

## S9 — Honesty discipline

Every performance or capability claim ships with its reproducer. Evidence-free claims are rework on sight (learned 2026-08-16).

## S10 — Feature registry discipline

No shipped feature silently disappears. `Program/FEATURE_REGISTRY.md` records every user-facing feature with origin and verified presence; drops need a named decision and a reason; the release gate walks it.

---

## Conformance (per project)

| Standard | OpenKai | KOS |
|---|---|---|
| S1 | TUI = the only TUI surface; KOS attaches via OK-10 | Consumes the served surface; builds no alternative surface |
| S2 | All components through the terminal seam | Grid cells are xterm.js backends only |
| S3 | Settled-frame replay on attach-hello | Re-attach expects a replay, not a blank |
| S4 | Frame pump in the served host | Slow cells get drops, not stalls |
| S5 | ro/rw token scopes on the attach channel | Watch tokens are never write tokens |
| S6 | `state` events beside frame bytes | Grid status from events, not ANSI parsing |
| S7 | `provider-config.ts` is the credential write path | Settings UI calls that path, never hand-edits |
| S8 | Zero KOS-specific code in packages | No OpenKai-specific code in KOS's grid |
| S9/S10 | Standing rules | Same |

*Adopted by reference into ADR OK-10 §4 and the E017 epic. KOS binds by including this file (docs/design) or by contract reference.*
