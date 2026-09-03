# Acceptance matrix — E024 Cortex completion

Environment classes: **dev** (this Mac; shared appliance is observation-only), **clean-kos** (`kos-test`, disposable OpenKai state), **clean-macos** (fresh local macOS account), **scratch** (disposable Cortex appliance), and **managed** (KOS launch with `CORTEX_PROJECT`). Evidence is literal, redacted output under `evidence/`; tokens, administrator credentials, provider keys, and pasted fake secrets never enter shell history or evidence.

## Result and release semantics

- **PASS** — the complete row was observed on the folded `0.1.13` candidate SHA/version in its named environment.
- **FAIL** — the drive completed and an expected observable did not hold.
- **BLOCKED** — a named prerequisite outside the drive is unavailable. A blocker is not a pass or waiver.
- **PARTIAL** — only a strict subset was observed, including historical `0.1.12` evidence.
- **PENDING** — the complete drive has not run.
- **Gate** — must be PASS before version-specific release consent is requested. **Post-publish** — necessarily runs after the consented publication action and must PASS before SHIP closes; failure enters release recovery. **Info** — recorded but not release-blocking.

All 2026-09-04 observations are `0.1.12` baseline evidence. They identify defects but do not satisfy a `0.1.13` candidate gate. Every gate row below must finish PASS on the folded candidate; FAIL, BLOCKED, PARTIAL, or PENDING blocks release.

## Clean-host reset contracts

- **KOS:** `ssh kos-test 'rm -rf "$HOME/e024" "$HOME/.omp" "$HOME/.openkai" "$HOME/.config/openkai" "$HOME/.local/bin/openkai" "$HOME/.local/bin/openkai.previous"'`, then install only the named candidate artifact or public channel. Evidence records the candidate SHA, asset SHA-256, host OS/arch, and literal output.
- **macOS:** an administrator interactively creates `openkai-e024` with `sudo sysadminctl -addUser openkai-e024 -home /Users/openkai-e024`; all drives run as `sudo -u openkai-e024 -H ...`; cleanup is `sudo sysadminctl -deleteUser openkai-e024 -secure`. The password is entered interactively and never captured. This row is BLOCKED until an operator with administrator access is present.

## Matrix

| Id | Env | Drive | Expected observable | Candidate evidence | Owner | Relevance | Current |
|---|---|---|---|---|---|---|---|
| A1-KOS | clean-kos | Reset; install from the public `scripts/install.sh` or Homebrew; `openkai --version` | Public installer/checksum succeeds; exact version `0.1.13`; no explicit asset URL bypass | `A1-kos-0.1.13.md` | operator | post-publish | PARTIAL — `A1.md` used an explicit 0.1.12 asset |
| A1-MAC | clean-macos | Create fresh user; install from the other public channel; `openkai --version` | Public installer/checksum succeeds; exact version `0.1.13` | `A1-macos-0.1.13.md` | CTO/operator (D6) | post-publish | BLOCKED — administrator required |
| A2-KOS | clean-kos | Start candidate `openkai` with no keys; execute `/cortex status` in the TUI | Keyless TUI remains running; status names install state, project, writer, rerank, degradation, and exact next action | `A2-kos-0.1.13.md` | operator | gate | PARTIAL — `A2.md` reached provider wizard only |
| A2-MAC | clean-macos | Same drive in fresh account | Same complete in-TUI observable | `A2-macos-0.1.13.md` | CTO/operator (D6) | gate | BLOCKED — administrator required |
| A3 | dev | Candidate TUI `/cortex status` with settings `memory.backend=off` and no `CORTEX_PROJECT` | Shared appliance, project `openkai`, registered writer, rerank state, and degradation rendered without activating memory | `A3-0.1.13.md` | kai | gate | PARTIAL — `A3.md` is API-only baseline |
| A4 | clean-macos | Published Cortex installer: `/cortex preflight`, confirm `/cortex install`, `/cortex status`, then uninstall/rollback in `finally` | Preflight and install exit 0; fresh local API becomes healthy; rollback restores absent state | `A4-0.1.13.md` | alpha@kaidera + operator | gate | BLOCKED — installer package is unpublished |
| A5 | scratch | `/cortex acceptance start` or typed Cortex lifecycle APIs create/reactivate `openkai-acceptance` and add `probe:probe` | Project 200 and active; exactly the acceptance roster; production project hash unchanged | `A5-0.1.13.md` | kai + Cortex owner | gate | PARTIAL — baseline project remains active |
| A6 | scratch | Select Cortex/project/agent; record a random marker; search it | Search returns marker; production project and rows hash unchanged | `A6-0.1.13.md` | kai | gate | PARTIAL — baseline only |
| A7 | scratch | Prove default `cortexingest.transcripts=false` produces no session row; enable it, end a second session, inspect `cortex-retain --status`; restore setting in `finally` | Default-off/no-ingest; opted-in UUID lands for `probe`; retention is reported; original setting restored | `A7-0.1.13.md` | kai | gate | PARTIAL — opt-in path only |
| A8 | dev | Candidate with no registered/default writer; attempt `cortex_record` through a counting proxy | Refused before payload/POST; message names the exact fix | `A8-0.1.13.md` | kai | gate | PARTIAL — 0.1.12 baseline passed |
| A9 | scratch | Paste generated fake `sk-…` only into TUI stdin; run `learn` and transcript path; scan captures in `finally` | Secret absent from captured request bodies, Cortex rows, transcript payload, error output, and provider file | `A9-0.1.13.md` | kai | gate | PARTIAL — stored rows only |
| A10 | dev | Settings `memory.backend=off`, no managed env; start candidate session through proxy | Zero Cortex calls; existing appliance rows unchanged | `A10-0.1.13.md` | kai | gate | PARTIAL — 0.1.12 baseline passed |
| A10M | managed | Settings remain `off`; launch once with `CORTEX_PROJECT=openkai-acceptance`, then relaunch without it | First status says managed lane active and record/search work; removing env returns to off with zero calls | `A10M-0.1.13.md` | kai | gate | PENDING |
| A11 | scratch | In a `finally` path remove `probe`, archive `openkai-acceptance`, and compare production hashes | Acceptance project archived/404; production project/config/rows unchanged | `A11-0.1.13.md` | alpha@kaidera + kai | gate | BLOCKED — Cortex has no archive API |
| A12 | scratch | Snapshot full server config, provider file, health, and degradation; apply `ollama/nomic-embed-text` and rerank unset; restore in `finally` | PATCH 200; model applied; backlog drains; vector-only shown; byte/semantic restoration proof passes | `A12-0.1.13.md` | kai | gate | PARTIAL — baseline was idempotent on shared appliance |
| A13 | scratch | Same snapshot/restore envelope; apply NVIDIA rerank with operator-provided key | Rerank health set; search reranked; degradation empty; prior state restored | `A13-0.1.13.md` | kai + operator | info | BLOCKED — scratch appliance/key unavailable |
| A14 | scratch | Snapshot; stop embed worker; search and inspect `/memory stats`; restore and recheck | Degradation non-empty and printed verbatim; no silent success; worker and prior state restored | `A14-0.1.13.md` | kai | gate | BLOCKED — scratch appliance unavailable |
| A15 | managed | `CORTEX_PROJECT=openkai-acceptance openkai` with no `memory.backend` edit | UI/status says managed lane active; record/search use acceptance project | `A15-0.1.13.md` | kai | info | PENDING |
| A16 | dev fixture | Hash every file under legacy memory root and relevant `agent.db` rows; upgrade `memory.backend=local` plus all legacy keys; hash again | Backend is off; notice shown once; zero `memories.*` settings; all file and DB hashes/rows identical | `A16-0.1.13.md` | kai | gate | PENDING |
| A17 | disposable | Verify newest backup age and checksum/integrity; restore into a disposable appliance; compare project/roster/row counts; destroy it in `finally` | Backup exists within threshold, verifies, restores without touching live state, and restored inventory matches | `A17-0.1.13.md` | KOS/Cortex owner + kai | gate | PARTIAL — `A17.md` proved age only |
| A18-KOS | clean-kos | Install 0.1.12, run `openkai upgrade --check`, upgrade, verify rollback copy | Witnessed manifest upgrades to exact 0.1.13 and retains rollback | `A18-kos-0.1.13.md` | operator | post-publish | PARTIAL — `A18.md` proved 0.1.10→0.1.12 |
| A18-MAC | clean-macos | Same upgrade drive in fresh account | Same complete observable | `A18-macos-0.1.13.md` | CTO/operator (D6) | post-publish | BLOCKED — administrator required |
| A19C | dev | Candidate release dry-run compares engine/wrapper/runtime versions, generated manifest, installer target input, expected assets, and source provenance | One candidate version/SHA; dry-run exits 0; no public mutation | `A19-candidate-0.1.13.md` | kai | gate | PENDING |
| A19 | public channels | After consented publication, compare npm, GitHub release/assets, `latest.json`, tap, and public `scripts/install.sh`; install from both public paths | Every channel reports 0.1.13 and expected checksums; no stale default | `A19-0.1.13.md` | kai | post-publish | FAIL — baseline public installer is v0.1.009 |

## Shared mutation rule

The dev appliance may be read but not mutated by A5–A7, A9, or A12–A14. Scratch drives snapshot before the first mutation and restore in `finally`; restore failure is FAIL and blocks every later mutation. A11 must run even when an earlier acceptance step fails. Direct Cortex database access is forbidden.
