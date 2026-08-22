# EPIC SPEC — E020: OMP v18 fold-ins (v0.1.10)

**Epic:** E020_OMP18_FOLDINS
**Release:** v0.1.10 (0.1.10 — ships ONLY on explicit CTO consent per docs/RELEASE_SOP.md)
**Owner:** kai@openkai (lead) · **lane: ren@openkai (CPO)**
**Opened:** 2026-08-22 (the day v0.1.009 shipped)
**Inputs:** OMP v18.0.0 release research (handoff 120aa47f) · TWO migration trials
this session, both run to ground with evidence.

---

## 1. The migration verdict (evidence, not vibes)

**The @oh-my-pi/*@18.0.0 namespace migration is BLOCKED on a product decision, not
engineering.** Two trials, both reverted, tree green:

1. Trial 1 (rename + bump): typecheck fails — pi-ai's API restructured across the
   17-line (Models/CredentialStore/contentText/uuidv7/createProvider/providers-all
   removed or moved; StreamFunction went generic). Mechanical but real.
2. Trial 2 (the killer): pi-18 packages ship TypeScript SOURCE as their runtime
   entry (`import: ./src/index.ts`) — and `auth-storage.ts` statically imports
   `./auth/sqlite-credential-store` which statically imports `bun:sqlite`. The
   eager chain means **pi-ai 18 cannot load under Node at all** (verified:
   ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING + the bun:sqlite eager import).
   OMP v18 is bun-runtime-only.

**Consequence:** migrating drops Node support for the npm channel (README promises
"node ≥ 22.19"). The standalone channel (bun-compiled) is unaffected. This is a
CTO-level product call:
- **Option A:** stay on 0.84.2 indefinitely; backport what we need (below).
- **Option B:** npm channel ships a bundled/bun-compiled artifact (esbuild/bun
  bundle at publish; the npm package becomes a binary wrapper). Breaks the
  "pure node" install story, shrinks install size, ends dependency drift forever.
- **Option C:** fork the pi line (vendor 0.84.2 into our tree) — the thing we've
  twice avoided; now on the table honestly.

## 2. Fold-ins landed on the 0.84 line (0.1.10 dev)

- **`/shake thinking`** (OMP v18 parity): strips reasoning blocks from context
  alongside tool results.

## 3. Fold-ins evaluated and REJECTED with evidence (do not re-litigate)

- **Startup composer / dropped keystrokes** — ours already survive: the TTY
  buffers early keystrokes into the composer (pty-verified this session).
- **Streaming code-block live highlighting** — pi-tui 0.84.2's Markdown already
  highlights open fences mid-stream (verified directly). v18's HighlightStream
  fixes a bug their renderer had; ours doesn't.

## 4. Backlog pending the migration decision

| Capability | Blocked by | Value when unblocked |
|---|---|---|
| Slow-terminal frame dropping (pendingOutputBytes + render gate) | migration (pi-tui 18 internal) | input never lags on slow terminals |
| Claude glyph tokenization + SSE stranded-turn fix | migration (pi-ai 18) | provider-compat correctness |
| Agent identity-after-handoff fix | migration (pi-agent-core 18) | handoff correctness |
| macOS spellcheck/autocorrect (TextAssistProvider) | migration | composer polish |
| `openkai bench` live dashboard (p50/p95, throughput, cost) | none — buildable on 0.84 | its own increment |
| `openkai render` session replay + pipeline benchmark | none — buildable on 0.84 | its own increment |
| Hashline sloppy fallback (weak-model edit resilience) | none | small increment |
| `tui.resizeScrollback` (append/rebuild/preserve) | none | small increment |
| In-place rewind truncation (/tree without scrollback replay) | none | small increment |

## 5. Increments

| # | Increment | Deliverable | Acceptance |
|---|---|---|---|
| 01 | **The CTO decision** (A/B/C above) with this evidence pack | a recorded decision | decision recorded; epic unblocked |
| 02 | **If A**: the backport lane — backpressure-gate pattern replicated in OUR write path (we own runtime.ts), bench/render increments | per-increment tests | suite + e2e green |
| 03 | **If B**: bundle build (esbuild/bun) for the npm channel, then the migration proper per the trial-1 error map | npm package runs the bundle under node | fresh `npm i -g` smoke on node |
| 04 | **If C**: vendor 0.84.2 into packages/vendor/pi-* with licence headers | tree builds without the npm deps | suite green |

The epic stays open across all three — the increments fork on the decision.
