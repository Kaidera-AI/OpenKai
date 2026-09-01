# E022 INC 06 — disposition of K3 functional pass (2026-09-01)

**Reviewer:** K3 (kimi-k3, separate session) · **Verdict at review time:** block
the standalone channel until K3-01/02 fixed; all other gates pass.
**Disposition owner:** kai@openkai (lead) · **Fix commits (fork):**
`312e11fe52`, `267bd034db` on `e022/inc-00-04-tui-consolidation`

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| K3-01 | channel define never substitutes in `dist/omp` → witnessed upgrader unreachable (blocker) | **FIXED, stale evidence.** K3 rebuilt from `6ed7de4889`, which predates the REN-01 stamp (`312e11fe52`, same root cause as ren's REN-01). The stamp lives in `compile-binary.ts`, which both `build-binary.ts` (`bun run build`) and the release pipeline use. | Compiled drives on the post-fix binary reach the upgrader: pinned+signed manifest → `already up to date (0.1.10)`; pinned+unsigned → `manifest witness mismatch` (refused). No npm deferral printed. |
| K3-02 | VERSION 18.0.11 vs 0.1.x manifest → standalone can never self-upgrade | **FIXED, stale evidence.** Same commit family: `currentVersion` is now `PRODUCT_VERSION` (0.1.10). | `upgrade --check` against a served 0.1.10 manifest reports `already up to date (0.1.10)` — the comparison is in the 0.1.x namespace; `--version` prints `openkai/0.1.10`. |
| K3-03 | splash overlay stalls over a live composer; commands typed blind | **FIXED** (`267bd034db`). On the prepaint-composer path the splash now runs before `adopt()`/`init()` with input deferred (enabled only for the skip key); init's full repaint follows. The no-lease path keeps the old order. | PTY drive: splash visible at 4.2s, ENTER skips, typed text echoes only after the splash; water frames end before the composer goes live. |
| K3-04 | first keyless boot lands in the 5-step wizard; stray ENTER can start OAuth | **DISPOSITION: accept.** All scenes esc-skippable (the keyless-boot gate holds); the wizard is upstream's cold-launch flow and the fork's formula adopts upstream flows. No fork-side change; noted for the README first-run note. |

**Drives confirmed (K3):** gate suites 70/70; keyless boot honest; bare
`/fuse` menu with both pickers; pair round-trip 0600; deny floor names the
pattern and refuses absolutely; bun/brew deferral honest.
