# Factory-AI org findings — vfs, tui-test, SDKs, plugin ecosystem

**Date:** 2026-08-16 · **Author:** kai@openkai · **Sources:** github.com/Factory-AI org repos, fetched live ( licences verified per-repo)

## Verdicts

| Repo | Licence | Verdict |
|---|---|---|
| `Factory-AI/vfs` (Rust, beta) | MIT | **Adapt patterns, no dependency** (ADR §5.4: no hard Rust dep for v1). Two patterns are first-class additions to our roadmap — see below. |
| `Factory-AI/tui-test` → npm `@microsoft/tui-test` | MIT | **ADOPT as devDependency now.** The ADR OK-5 adopt item was blocked on a wrong package name (`@factory/tui-test` 404s); the real package drives the real TUI over a pty, cross-platform. |
| `droid-sdk-typescript` | NOASSERTION (check before use) | Pattern reference only: the documented session protocol (`initialize_session`/`add_user_message`/`session_notification`/`request_permission`) already fed OK-3. |
| `factory-plugins`, `cursed-plugins`, `skills` | MIT | Ecosystem-import pattern (droid finding #14): treat incumbent ecosystems as import formats. Post-v1. |
| `eslint-plugin` | Apache-2.0 | Optional CI lint additions; evaluate post-v1. |

## vfs — what it is and what we take

A SQLite-backed virtual filesystem for agents: copy-on-write sandbox, FUSE/NFS mount, and **session teleporting** — a live session (dirty tree, staged/unstaged split, scratch files) seals into one sha-verified *delta* file and resumes on another machine at the same base pin (`vfs pack` / `vfs adopt`, wrong-base refusal). Crates: `vfs-core`, `vfs-cli`, `vfs-fuse`, `vfs-nfs`, `vfs-mount`.

**Pattern 1 — CoW overlay mutation staging (candidate Inc 09).** Today: approval precedes mutation, shadow-git snapshots for undo. The vfs inversion: mutations land in an overlay immediately; the real tree stays clean; approval merges down; rejection discards. Stronger review semantics (inspect the real post-state before consent) and cleaner aborts. TypeScript-portable over our existing shadow-git store: stage writes into the shadow work tree, diff from there, merge on approve.

**Pattern 2 — session teleport (candidate Inc 10, pairs with KOS handoffs).** `openkai session pack/adopt`: seal the JSONL v3 tree + shadow-git bundle + untracked-files manifest into one sha256-chunked artefact with a base pin (HEAD sha); adopt refuses on pin mismatch. This is the missing half of KOS's handoff portability — work-in-progress state moving between agents/machines with integrity proofs.

**Not taken:** the Rust codebase itself, FUSE/NFS mounting (operator-visible mounts are out of our single-machine v1 scope), the self-updater (ours exists).

## tui-test — adoption

`npm i -D @microsoft/tui-test`; one e2e smoke driving the compiled CLI in a pty (boot frame renders; splash appears once; palette opens on Ctrl+K). This upgrades the TUI bar from component-frame assertions to driving the real binary — TUI refactors become safe end-to-end.

## Process note

Patterns over linkage holds (ADR §5); the two vfs patterns enter the Program as post-v1 increment candidates, not v0.01.001 scope.
