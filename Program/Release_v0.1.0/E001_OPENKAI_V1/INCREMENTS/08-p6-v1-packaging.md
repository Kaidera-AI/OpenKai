# Inc 08 — P6 v1 packaging + release

**Status:** PLANNED · **Owner:** unassigned · **Sprint:** S5 · **Depends:** Inc 03, 05

**Goal:** Anyone can install OpenKai; KOS consumes it as an auto-upgraded component.
**Deliverable:** npm package (`@openkai/cli` bin) + per-platform binaries (bun compile per pi-mono pattern); dual-channel auto-upgrade (droid pattern: standalone channel with env kill-switch + rollback, npm build pinned at build time); update witness verification; `openkai info` self-check (version, API reachability, model catalogue, session dir); install + onboarding docs (quill); KOS-side lane-driver skeleton (control/use/manage) — cole, kaidera-os repo; licence file (MIT per ADR D5, confirm text at first push).
**Acceptance:** clean-machine install runbook passes (fresh user, npm install, first run under 5 minutes); upgrade + rollback exercised end-to-end; `openkai info` output attached; quill docs walkthrough green; ren + kai release sign-off.
**References:** ADR OK-8 (D3–D5); pi/omp packaging findings.
