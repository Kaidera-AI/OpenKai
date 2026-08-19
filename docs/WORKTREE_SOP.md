# Worktree SOP (OpenKai)

**Status:** BINDING from 2026-08-19 (CTO directive). Applies to every agent and every release.

## The convention

- **One release branch → one worktree root per agent per release:**
  `.worktrees/<agent>-<release>-<slug>` — e.g. `.worktrees/ren-release-0.1.007-review`,
  `.worktrees/kai-release-0.1.007-orchestration`.
- The release branch (`release/0.1.NNN`) is checked out in exactly one worktree
  (the integrator's). Agents working on the same release create a **task branch**
  off it: `release/0.1.NNN-<slug>`, checked out in their own worktree.
- **Never work in the main checkout** (`~/DevVault/OpenKai`) — that's the CTO's
  tree; agents must not switch its branch or leave it dirty (learned the hard
  way: a review agent's reads moved under them when the checkout was switched).
- Integration: the integrator merges task branches into the release branch,
  runs the full gate (typecheck + suite + security-audit), then commits.
- Cleanup: when a release ships, its worktrees are removed
  (`git worktree remove`) and task branches deleted after merge.

## Why

- Concurrent agents never share a working tree — no moved-under-you reads, no
  cross-agent dirty state.
- Every worktree maps to one agent + one task + one release: `git worktree list`
  is the org chart.
- The CTO's checkout is always safe to test from.

## Current layout (2026-08-19)

| Worktree | Agent | Purpose |
|---|---|---|
| `.worktrees/ren-release-0.1.007` | ren | integrator for release/0.1.007 (this branch) |
