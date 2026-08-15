# Inc 02 — P2 agent loop + session persistence

**Status:** DONE (2026-08-15) · **Owner:** bob@openkai · **Review:** kai (accepted) · **Sprint:** S1

**Goal:** Single-lane tool-using conversation through pi-ai, remembered in Cortex.
**Deliverable:** `SessionTransport` + `SessionEvent` taxonomy (field-addressed deltas, `openkai.session.v1`); `InProcessTransport` over pi-agent-core 0.84.2; JSONL v3 session tree (`.openkai/sessions/`); debounced idempotent `/sessions/ingest` checkpoints; `/log` lifecycle events; read-only tool trio; `openkai chat`/`sessions` commands; default model `nvidia/nemotron-3-nano-30b-a3b:free`.
**Acceptance:** live e2e exact-marker round-trip; session tree with id/parentId; session uuid in `/sessions/ingested-ids`; started/stopped on the event stream; auth fail-fast exit 1.
**Evidence:** commits `2bbdd45` + `8700a41` (review fix: traversal guard); handoff `1d3e0f0c` accepted; scope `research/2026-08-15-p2-agent-loop-scope.md`.

**Security:** E001 gate applies — `scripts/security-audit.sh` green + cole Strix-pattern review of the new surface (SECURITY.md).
