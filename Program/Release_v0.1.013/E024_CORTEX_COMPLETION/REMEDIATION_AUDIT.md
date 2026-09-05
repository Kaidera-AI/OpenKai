# E024 remaining-gate audit and PASS remediation plan

**Author:** kai@openkai · **Date:** 2026-09-05 · **Trigger:** handoff
`679792f1-f4d2-469c-beb4-5366c9755a15` (quill → lead, [REVIEW]).
**Authority:** `STATE.md` + `ACCEPTANCE_MATRIX.md` (this folder).
**Verified tips:** OpenKai candidate `db7f921658c57e943a763a06bf25312d9ac5eef4`
(worktree `openkai-fork-e024-retire-local`, branch `e024/w3-retire-local`);
fork main `c6c7fa7b1b`; product/programme HEAD `2224df7ae6`
(`maintenance/0.84-line`); KOS platform candidate `c03dbba9`; installer
successor `640079bb`; evidence commit `2224df7ae6`. Ren GO re-anchored to the
candidate per `DISPOSITION_REN_W6.md` — review, not release authorisation.

Every claim below carries literal observed output in `evidence/`. No release
mutation, no shared `:8501` write, no credential printed, occurred in this
audit.

## 1 · Rows driven to PASS by this audit (2026-09-05)

| Row | Was | Now | Evidence |
|---|---|---|---|
| A6 | PARTIAL (0.1.12 baseline) | **PASS** | `evidence/A6-0.1.13.md` — settings-driven (`memory.backend=cortex`, `cortex.apiUrl`, `cortex.project`; no env) record+search of a random marker on the reset scratch appliance; production search 0 hits; production fingerprint byte-identical; terminal reset+up → project 404, `{"projects":[]}` |
| A7 | PARTIAL (opt-in only) | **PASS** | `evidence/A7-0.1.13.md` — default-off: `ingestTranscript()=false`, UUID absent from `/sessions/ingested-ids`; opt-in: true, UUID `0aea78f8-70e7-43f8-af2b-2ec22eed02ac` ingested and transcript searchable; retention reported via real `cortex-retain --status` (messages 2 / team_events 1 rows); settings untouched (isolated in-memory instances); terminal reset+up proven |
| A9 | PARTIAL (stored rows only) | **PASS** | `evidence/A9-0.1.13.md` — generated fake `sk-e024fake…` placed only in record content/source and transcript stdin text; absent from stored rows, all 5 captured outbound bodies, transcript payload, error output, and `~/.openkai/config.json` (provider file unchanged: embedding local/embed-v1, rerank unset) |

Driver: `evidence/e024-a6a7a9-drive.ts` (candidate source imports;
`Settings.isolated`, `cortexWriterClientFor`, `CortexIngestController`,
process-local fetch capture). Scratch admin token loaded process-only from
`cortex-test.env` for the create-only registration; scratch DB published on
`127.0.0.1:18602` via a scratch-only compose override solely for the
retention CLI. Cleanup contract: `cortex-test.sh reset` + `up` (KOS
`de446e27`) — the running scratch image carries **no typed project-archive
route** (see §5 F1), so reset+up is the normative terminal state per
`TEST_APPLIANCES.md`.

## 2 · Per-row audit of the remaining non-PASS rows

| Row | Current | Root cause | Owner | Repo / files | Smallest safe fix or drive | Prerequisites | Rollback | Reproducible proof |
|---|---|---|---|---|---|---|---|---|
| A2-KOS | PARTIAL | No exact-candidate clean-KOS boot; host was unreachable at record time. **Host now answers SSH** (Linux 6.12 x86_64, no openkai installed — verified 2026-09-05) | operator + kai | fork: `bun build --compile` linux-x64 target | Compile the exact candidate for linux-x64, scp the artifact to kos-test, reset per matrix contract, keyless TUI boot, `/cortex status` full observable | kos-test stays reachable; linux-x64 compile of `db7f9216` | delete artifact; kos-test has no openkai state to restore (`~/.openkai` absent) | `A2-kos-0.1.13.md` with literal TUI status |
| A2-MAC | BLOCKED | Fresh macOS account requires an interactive administrator | CTO/operator (D6) | — | Operator-present drive per matrix reset contract | administrator session | `sysadminctl -deleteUser openkai-e024 -secure` | `A2-macos-0.1.13.md` |
| A4 | PARTIAL/BLOCKED | `@kaidera-ai/cortex` unpublished; prepare-only successor (`640079bb`) passed 19/19 but a published clean-host install/status/rollback is missing | alpha@kaidera + operator | cortex repo `kai/installer-successor-candidate-20260904` | alpha publishes the reviewed installer through an authorised release; then clean-host preflight/install/status/rollback in `finally` | publication consent on the Cortex side | uninstall path is part of the drive | `A4.md` exact-candidate appendix |
| A1-KOS / A18-KOS | PARTIAL | Post-publish rows; public channels do not carry 0.1.13 and the public installer defaults `v0.1.009` at `a8674ed2` | kai (post-consent) | product: `scripts/install.sh`, release workflow (W3D machinery already reviewed) | Run after consented publication per RELEASE_SOP action order; W3D job repoints installer as gated action 5 | W7 consent naming 0.1.13 | SOP recovery states 1–5 | `A1-kos-0.1.13.md`, `A18-kos-0.1.13.md` |
| A1-MAC / A18-MAC | BLOCKED | Same as A2-MAC, post-publish | CTO/operator (D6) | — | Operator-present post-publish drives | consent + administrator | as A2-MAC | `A1-macos-0.1.13.md`, `A18-macos-0.1.13.md` |
| A19 | BLOCKED | No publication authorised; channel set inconsistent by design until W7 | kai (post-consent) | npm/GitHub/tap/`latest.json`/installer | Post-consent channel comparison + both public installs | consent | SOP recovery | `A19-0.1.13.md` |
| A13 | BLOCKED (info) | NVIDIA rerank credential unavailable; rerank-off subcheck alone is not the normative drive | operator | — | Process-only credentialed apply/search/restore on scratch with snapshot/restore envelope | operator key, placed by the drive, never persisted | `finally` restore proven | `A13-0.1.13.md`; **non-blocking** per W1/W6 dispositions |

## 3 · Separation: code-fixable vs external

**Code-fixable now (no consent needed; release-path preconditions, STATE §6 amendment (b)):**
1. Product main CI red: `npm ci` → `No matching version found for @kaidera/openkai-core@0.1.10` — product repo still carries the 0.84-line package tree (root `package.json` name `openkai` 0.1.11, workspaces core+cli). Decision needed: fork tree vs docs/ledger-only tree with own CI. Files: product `package.json`, `.github/workflows/*`. Owner kai; review ren.
2. npm publish path: `release.yml` dropped the `NODE_AUTH_TOKEN` fallback (`3a22a40258`) while published 0.1.12 carries registry signatures but no provenance attestations. Fix: prove trusted publishing with an attestation on a dry run, or restore the fallback. Files: product `.github/workflows/release.yml`.
3. Version drift: product `package.json` 0.1.11 < shipped 0.1.12. Align in the same wave.
4. Docs-only `0.1.11` fold decision (recommended: fold into 0.1.13 notes; a docs-only cut renumbers E024) — CTO decision, then a one-line changelog/ledger amendment.

**External (blocked on named owners, not code):** A4 (alpha publication), A2-MAC/A1-MAC/A18-MAC (administrator), A13 (credential), A1/A18-KOS/A19 (consent-gated publication), ren autonomy (four review rows HELD by the console orchestrator since 2026-09-02 — CTO choice: trigger per session vs `designation: autonomous`).

## 4 · Ordered remediation waves

| Wave | Content | Owner | Gate |
|---|---|---|---|
| W-α | Release-path code: items 1–3 above in one reviewed worktree on product main; item 4 as a ledger amendment after the CTO choice | kai; ren review | changed-contract tests + CI green on product main; no publication |
| W-β | Pre-publish drives: A2-KOS (linux-x64 exact-candidate compile + kos-test drive); A13 iff the operator supplies the key | kai + operator | evidence files; production untouched |
| W-γ | External closure: alpha publishes installer (A4 drive follows); administrator sessions (A2-MAC) | alpha@kaidera; CTO/operator | per-row evidence |
| W-δ | Consent gate: request explicit live-session CTO consent naming **0.1.13** only after every pre-publish gate row is PASS; then W7 publication and post-publish rows A1/A18/A19 | kai prepares; CTO authorises | RELEASE_SOP sequence; recovery states on partial |

Stop condition unchanged: until W-γ/W-δ prerequisites exist, the truthful
outcome is **MAINTAIN / NO-GO**.

## 5 · New findings from this audit

- **F1 — scratch image lacks the typed archive route.** The running
  `cortex-test` image (built at `bfbf9134`) has no
  `POST /admin/projects/{key}/archive` (openapi verified 2026-09-05; the
  route exists only in KOS `de446e27`+). A11 remains PASS (it used an owned
  scratch carrying the implementation); terminal cleanup for scratch drives
  is reset+up per `TEST_APPLIANCES.md`. Filed as an observation for
  kai@kaidera-os: rebuild the scratch image from a rev carrying the archive
  route so future drives can use typed terminal cleanup.
- **F2 — `cortex-retain --status` prints `oldest: ?`** while counts are real
  (workspace script date query). Cosmetic; KOS script; informational only.
- **F3 — kos-test is reachable again** (was "refuses SSH" at the last
  amendment): Linux 6.12 x86_64, no openkai installed. A2-KOS's host
  precondition is cleared; the row remains non-PASS until the W-β drive.
- **F4 — A6/A7/A9 closure removes three of the five pre-publish gate
  blockers** listed in `SHIP_RECORD.md` §Blocking gate state; the surviving
  pre-publish blockers are A2-KOS (drive pending), A2-MAC (administrator),
  and A4 (installer publication).
- **F5 — shared-plane handoff returns 500 (platform defect).** The shared
  `:8501` DB (2026-08-15 backup restore) carries a pre-migration
  `handoffs_status_check` without `returned`/`released`, while image
  `04eb5439` sets `status='returned'` on task returns: every cross-agent
  return CheckViolationErrors (proof + repro + fix DDL in
  `evidence/PLATFORM_DEFECT_HANDOFF_STATUS_CHECK.md`). Consequently the
  normative return of handoff `679792f1` is **blocked on the platform**; the
  row stays claimed by kai with the completion report ready, and the defect
  is filed to kai@kaidera-os via this evidence document (cross-project
  Cortex plane needs the shared admin token, which OpenKai does not hold).

## 6 · Adjudication and review

Kai adjudicates the audit: the three driven rows are **accepted as PASS** on
the evidence above; the remaining rows keep their normative statuses; the
remediation order is W-α → W-β → W-γ → W-δ. Per `DEVELOPMENT_PROCESS.md` the
audit and this plan go to Ren for adversarial review — handoff
`f2053478-88f2-40f7-90c7-a1323b28fc90` (created 2026-09-05; Ren runs on
trigger or autonomy flip, so the review is pending at this return). Review GO
is required before W-α folds; neither review nor this audit authorises any
release action.
