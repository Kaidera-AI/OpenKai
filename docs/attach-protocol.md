# OpenKai Attach Protocol v1 (OK-10)

The wire contract for browser/xterm.js consumers of the served TUI. Binding for KOS and any other client. ADR: `research/2026-08-19-served-tui-attach-ADR.md`. Standards: `docs/ARCHITECTURE_STANDARDS.md` (S1–S6).

## Transport

- `openkai serve` (loopback-only, bearer required for everything except `/health`).
- `POST /sessions { model?, provider? }` → `{ sessionId, attach }` — creates a hosted TUI session (a real TuiController against a headless terminal).
- `GET /attach/<sessionId>?mode=ro|rw&width=<cols>` — WebSocket upgrade (RFC 6455). Requires `Authorization: Bearer <OPENKAI_HUB_TOKEN>` and a loopback Host header.

## Frames (server → client)

All JSON text frames.

| type | when | shape |
|---|---|---|
| `hello` | once, on attach | `{ type, sessionId, mode, frame }` — `frame` is the settled full screen (ANSI string) at the requested `width` (default 100). Replays on every (re)attach — a client never sees a blank screen (S3). |
| `frame` | as the host renders | `{ type, data }` — full frame (ANSI string). Coalesced by the host's pump (default 15 fps); slow readers get newer frames, never a stall (S4). |
| `state` | on change | `{ type, state: { busy, plan, model, sessionId, tier? } }` — structured status, no ANSI parsing needed (S6). |

## Messages (client → server)

All JSON text frames. **Masked** per RFC 6455 (client→server frames must be masked).

| type | scope | shape |
|---|---|---|
| `input` | **rw only** | `{ type: "input", data }` — key events (bytes as the terminal would send them, e.g. `"a"`, `"\r"`, `"\x1b[C"`). Read-only attaches: ignored at the seam (S5). |
| `resize` | ro + rw | `{ type: "resize", columns, rows }` — re-render at the new geometry (min 20×4). |

## Scopes

- `ro` (read-only): `hello`, `frame`, `state`, `resize`. Input frames are ignored.
- `rw` (read-write): everything above plus `input`.

## Grid guidance (multi-agent watch)

- N read-only attaches, one rw for the focused cell.
- xterm.js renderer backends: `dom`/`canvas` for grid cells, `webgl` only for the focused cell (browsers cap WebGL contexts at ~16).
- Re-attach freely: attaches are ephemeral; the hosted session (and its agent run) lives in the hub. `hello` always carries the current settled frame.

## Guarantees

- The served TUI is the same TuiController as the terminal TUI — same input grammar, same overlays, same chrome (S1/S2). There is no second surface.
- The hub refuses non-loopback hosts and missing/invalid bearer tokens with 401/403 **before** the upgrade completes.
