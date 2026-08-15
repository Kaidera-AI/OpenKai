# Inc 01 — P1 scaffold + Cortex client

**Status:** DONE (2026-08-15) · **Owner:** kai@openkai · **Sprint:** S1

**Goal:** OpenKai talks to Cortex through the typed API boundary only.
**Deliverable:** `@openkai/core` CortexClient (GET /health, GET /projects/<key>) + GET /events SSE bridge with OK-3 hygiene (connected-first, `: ping` keep-alives, last_id+Last-Event-ID resume, capped 1s→30s backoff, 4xx fail-fast, in-band error frames); `@openkai/cli events --print`.
**Acceptance:** build+typecheck green from clean; live cortex-log marker rendered end-to-end.
**Evidence:** commit `79a1a99`; handoff `6d70f337` accepted; marker events 202370/202374; work-product receipt filed.

**Security:** E001 gate applies — `scripts/security-audit.sh` green + cole Strix-pattern review of the new surface (SECURITY.md).
