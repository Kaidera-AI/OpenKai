# Inc 04 — P3 fusion core

**Status:** IN DEVELOPMENT · **Owner:** kai@openkai (lead development lane) · **Sprint:** S2

**Goal:** One task, two roles, one honest merge — the E016 fusion slice delivered through OpenKai.
**Deliverable:** `packages/core/src/fusion/`:
- `panel.ts` — FU-1 role-split execution: architect + builder as **separate fresh sessions** (never history forks), parallel invocation, self-pairing default (same model both roles, zero new plumbing);
- `synthesis.ts` — FU-2 structured merge: consensus · divergence (kept, attributed) · discarded (with reason) · blind spots; mandatory `[ARCHITECT]`/`[BUILDER]` tags — unattributed merge is a hard error;
- `gate.ts` — FU-3 full loop: validator designs executable checks read-only BEFORE work; baseline run MUST fail RED (green baseline = weak gate, surfaced loudly); gate visible-but-immutable to the builder; FAIL output verbatim feedback; cap 3 rounds, escalate; gate repair once per run without consuming a builder round; halt loudly at cap;
- `telemetry.ts` — FU-5-shaped run records (per-role model/latency/usage/gate outcome) as session custom entries + local fusion artifacts;
- `openkai fuse` CLI (print mode).
**Acceptance:** offline tests (faux provider): attribution enforcement, RED-baseline enforcement, verbatim feedback, cap-halt; one live fused run artifact when a key is present; build/typecheck green.
**Scope:** `research/2026-08-15-p3-fusion-scope.md`.

**Security:** E001 gate applies — `scripts/security-audit.sh` green + cole Strix-pattern review of the new surface (SECURITY.md).
