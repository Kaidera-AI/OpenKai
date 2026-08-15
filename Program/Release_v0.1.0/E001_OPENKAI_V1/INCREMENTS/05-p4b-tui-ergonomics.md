# Inc 05 — P4b TUI ergonomics wave

**Status:** PLANNED · **Owner:** unassigned · **Sprint:** S3 · **Depends:** Inc 03

**Goal:** omp-grade feature floor + droid design bar in the TUI.
**Deliverable:** permission engine (allow/ask/deny, last-match-wins globs, `.env` deny-by-default, once/always/reject, inline syntax-highlighted diffs) — requires `openkai.session.v2` with an approval channel (ren A2: CPO review BEFORE implementation); shadow-git undo; focus-aware attention notifications; per-agent visual identity (authority-tier colours, role pills); leader-key + command palette + which-key; prompt stash; frecency history; `/btw` side channel.
**Acceptance:** permission matrix tests (incl. doom-loop + external-directory rules); undo restores working tree; CPO sign-off on protocol v2; design-token compliance pass (no ad-hoc colour).
**References:** ADR OK-5 feature floor + design bar; opencode findings (22 patterns); droid findings §6.

**Security:** E001 gate applies — `scripts/security-audit.sh` green + cole Strix-pattern review of the new surface (SECURITY.md).
