# E022 INC 06 — disposition of qwen3.8 pro security/UAT pass (2026-09-01)

**Reviewer:** qwen3.8 pro (security-reviewer session) · **Verdict:** no live
leak path; one high (QW-01, dead redaction boundary) + hardening items.
**Disposition owner:** kai@openkai (lead) · **Fix commit (fork):** `267bd034db`

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| QW-01 | telemetry redaction boundary had no writer — bandit permanently cold, Cortex artifact path dead (high) | **FIXED.** `fusion-tool.ts` calls `recordFusionRun(result.record)` after `fuse()`, then `exportFusionRunArtifact` in managed mode — the redaction boundary is now the only telemetry writer. | Live drive (rebuilt dist/omp, ollama pair): a real fusion run wrote `.openkai/fusion/runs.jsonl` with redacted task/role text (runId mtip242g-…). |
| QW-02 | TMPDIR env-poisoning disabled containment (at 6ed7de4889) | **ALREADY FIXED** at `312e11fe52` (ren REN-04); qwen's re-probe on the final head returned blocked. Recorded for chain completeness. | Reviewer's own before/after probes; regression tests in openkai-floor.test.ts. |
| QW-03 | Ed25519 trust root ships unpinned (witness degrades to SHA-256 + transport) | **FIXED** at `267bd034db`: `OPENKAI_RELEASE_KEY` define pins the 0.84-line public key (SPKI derived from the CTO-custodied `~/.openkai/release-private.pem` — verified match before pinning; the private key never enters the tree). | Compiled drive: pinned+signed manifest accepted; pinned+unsigned refused fail-closed (`manifest witness mismatch: expected signed manifest, got unsigned`). |
| QW-04 | floor inspects structured path args only; bash redirection rides upstream approval | **DISPOSITION: accept.** Ported 0.84 invariant, unchanged by the diff; live model refused the shell-redirection workaround on its own. No fork-side change. | Reviewer's live drive; session record names the floor pattern. |

**Deferred (reviewer, environmental):** tier-flip chip not driven live (gate
suite green; wiring read); composer-depth/magic-shimmer rows (native upstream
surfaces); managed-mode Cortex round-trip blocked on the missing `openkai`
project registration (operator action, INC_05).

**UAT rows confirmed:** keyless boot/brand (mint truecolor, `OpenKai v0.1.10 ·
engine 18.0.11`, hex mark), fusion panel with divergent verdict + verification
child, deny floor absolute refusal, sessions resume.
