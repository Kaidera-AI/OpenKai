# ADR OK-10 — Served TUI: browser attach as a first-class, product-owned surface

**Date:** 2026-08-19 · **Author:** ren@openkai (CPO, TUI owner) · **Status:** RATIFIED (CTO directive, same session)
**Consult:** e631806e (kai@kaidera-os) — answered here in full
**Amends/extends:** OK-9 (orchestration) · E017 epic (adds increment 11)
**Audience:** CTO · kai@openkai · kai@kaidera-os (KOS)

---

## 0. The rule, restated by the CTO

**OpenKai is a fully independent product.** The TUI is complete without KOS — installable, runnable, full-featured on any machine with a terminal, forever. Nothing in the TUI path may depend on KOS, Cortex, or any other Kaidera product. And nothing about the TUI is a split task: **the TUI lane is owned by ren@openkai** — design, implementation, review.

KOS integration exists, but on one term: **KOS consumes OpenKai's served surface. It never co-owns it.**

## 1. Decision

**OpenKai serves its own TUI over a WebSocket attach channel as a first-class product surface (`openkai serve`).** A browser (KOS's grid, an editor, any xterm.js client) attaches to a session the hub hosts and sees *the actual TUI* — splash, chips, overlays, pickers, /shift, /diff — not an HTML reconstruction of one.

This is the consult's Option A, refined: **no node-pty, no process farm.** pi-tui already renders headlessly (the golden-frame harness renders full frames to strings); the hub hosts the TUI against a headless terminal and streams frames.

### What attaches get

| Mode | Purpose | Input | Output |
|---|---|---|---|
| **read-only** | the multi-agent grid: watch N agents live | none (ignored) | frame stream |
| **read-write** | drive one focused session | key events | frame stream |

- **Attach hello:** the host re-renders the settled frame on connect — a watcher never attaches to a blank screen. This is the resume/replay semantics the consult's Option C wanted; it belongs to the served TUI, not a standalone protocol.
- **Hub posture unchanged:** loopback-only bind, bearer token required (per hub.ts), read/write and read-only tokens are separate scopes (a watch token can never inject input).
- **Session lifecycle:** sessions are hub-owned; attaches are ephemeral and die with their socket; the session (and its agent loop) continues regardless — KOS can drop and reattach without touching the run.

## 2. The multi-agent grid (the "keep an eye on all agents" requirement)

The grid is N read-only attaches with a focus-to-drive model. The known browser constraint — **WebGL contexts cap at ~16** — is a renderer-config detail, not a blocker, and the contract says so explicitly:

- Grid cells use xterm.js's `dom` or `canvas` renderer backends (no WebGL context each).
- Only the **focused** cell gets the accelerated `webgl` renderer (the VS Code multi-terminal pattern).
- Beyond ~24 cells, page the grid rather than mounting more live renders.

## 3. Wire protocol (v1)

```
GET ws://127.0.0.1:<port>/attach/<sessionId>?mode=ro|rw
Authorization: Bearer <OPENKAI_HUB_TOKEN>            (rw: separate scope)
→ 101 Switching Protocols
← { type: "hello", sessionId, model, cwd, frame }    // settled-frame snapshot (ANSI string)
← { type: "frame", seq, data }                       // ANSI chunks as the host renders
→ { type: "input", data }                            // rw only; key events
← { type: "state", busy, tier?, plan? }              // cheap status for grid cells
```

- The frame stream is terminal bytes end-to-end. No HTML, no DOM diffing, no parsed alternative surface — ever.
- Backpressure: the host coalesces frames to ≥30fps per attach; slow readers get frame-drops, never loop-stalls (the bounded-queue discipline from the transport).
- Session list comes from the existing `/sessions` endpoint; attach by id.

## 4. Independence invariants (testable)

1. `openkai` and `openkai serve` run with no KOS/Cortex env present (already true; pinned by the mode-matrix tests).
2. The attach channel is additive: removing it changes nothing about the terminal TUI.
3. No KOS-specific code, headers, or behaviour anywhere in packages/** — the attach surface is generic xterm.js-over-WS.
4. The served TUI is byte-identical in behaviour to the terminal TUI (same TuiController, same input path) — the host is a terminal, not a second renderer (ADR §3's "same transport, second renderer" rule, now with a third consumer of the same rendering, not a new one).

## 5. Ownership map

| Surface | Owner |
|---|---|
| TUI (all of it: design, app, chrome, pickers, served host) | **ren@openkai** |
| Hub attach channel + protocol implementation | kai@openkai, ren review before merge |
| KOS grid/embed (xterm.js panes, renderer strategy) | kai@kaidera-os — against this contract only |
| Contract changes | ren@openkai (CPO review gate, per standing rule) |

## 6. Rejected alternatives

- **PTY farm (node-pty per session):** native dep, process lifecycle, no benefit over the in-process headless host.
- **KOS keeps the PTY (status quo B):** splits harness-experience ownership — the exact split that produced the parsed-HTML dead end.
- **Contract-only (C):** a frame protocol without a served TUI puts KOS back in the presentation business.
- **Parsed HTML chat feed:** structurally impossible over differential rendering (kai's evidence §1), and dead on arrival per the CTO.

## 7. Sequencing (E017 increment 11)

| # | Item | Owner |
|---|---|---|
| 11.1 | WS attach channel + attach modes + token scopes on `openkai serve` | kai@openkai (ren review) |
| 11.2 | Headless-TUI host: session → headless terminal → frame stream + input path | ren@openkai |
| 11.3 | Attach hello (settled-frame replay) + backpressure | ren@openkai |
| 11.4 | Contract doc (`docs/attach-protocol.md`) + grid-renderer guidance for KOS | ren@openkai |
| 11.5 | KOS grid consumes it (outside this repo) | kai@kaidera-os |
