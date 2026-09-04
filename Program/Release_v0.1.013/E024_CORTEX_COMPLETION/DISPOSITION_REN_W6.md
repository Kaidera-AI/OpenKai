# E024 W6 — Ren implementation review disposition

Date: 2026-09-04  
Owner: kai@openkai  
Reviewer: RenSourceV2 (independent, read-only)

## Verdict chain

| Reviewed source | Verdict | Meaning |
|---|---|---|
| `e0b2ebaab3f03c3dad910d0cd6be98c86c7a7e30` | **NO-GO — 3 findings** | All findings accepted; no release action authorised. |
| `8aef97f7f4ad2753b0e81627139dec6572270bd2` | **GO — no findings** | All three accepted blockers resolved in the implementation tip. |
| exact candidate `db7f921658c57e943a763a06bf25312d9ac5eef4` | **GO — no findings** | Prior GO re-anchored after the version/changelog stamp and test-only environment-isolation fix. |

Ren ran no formatter, lint, test, build, publication, or release action. Kai ran the candidate checks separately. A GO implementation review is a source-quality prerequisite, not CTO consent and not a SHIP verdict.

## Accepted findings and final disposition

| Finding | Severity | Correction | Permanent evidence | Disposition |
|---|---|---|---|---|
| Provider operations could interleave snapshot, PATCH, dry-run, file commit, and rollback. | High | A recovery-safe process queue now encloses the complete provider transaction from fresh snapshots through commit or rollback. Detached Settings hooks catch unexpected rejection without logging secret-bearing error content. | Controlled deferred interleaving proves operation 2 cannot snapshot before operation 1 rolls back; a separate unexpected-rejection case proves the queue remains live. | **Resolved** |
| Admin config responses were trusted at runtime, allowing malformed rerank-off snapshots or PATCH responses to authorize mutation. | High | Both GET and PATCH now validate all six rollback-critical fields, value types, nonblank provider/model names, positive-integer-or-null dimensions, rerank pair consistency, and enabled-pair presence. | Table-driven malformed GET cases assert zero PATCH, zero provider-file rename, and unchanged file; malformed successful PATCH responses roll back before commit; error bodies are redacted. | **Resolved** |
| Successful `/degradation` items could be rendered without credential redaction. | Medium security | Status and `/memory stats` share one degradation serializer that applies `redactSecrets`. | Shaped and ambient opaque credential tests prove the secret is absent while component/reason text remains visible on both surfaces. | **Resolved** |

## Prior W6 blocker set

The preceding five-finding review is also closed on the reviewed candidate:

1. deterministic unique memory sources prevent Cortex source-upsert collapse;
2. model pickers expose only live, seeded, servable selections and apply through the validated transaction above;
3. `/workers/health` and administrator backlog are authoritative over an empty degradation list;
4. backup evaluation requires an independently identified disposable target and proves target absence after cleanup;
5. product documentation states that new rows are immediately lexically searchable but require Cortex maintenance backfill before vector recall.

## Review boundary

This review does not clear the external release gates. The unpublished Cortex installer, missing typed project archive operation, absent disposable restore runner, unavailable alternate embedding runtime, unavailable clean hosts, public-channel checks, and version-specific CTO consent remain governed by `ACCEPTANCE_MATRIX.md`, `STATE.md`, and `docs/RELEASE_SOP.md`. The unavailable rerank credential leaves informational A13 BLOCKED but is not itself a release gate.

## Final implementation-and-evidence review

After the exact-candidate A10M, A14, and A15 drives, Ren re-read the source candidate and consolidated programme/evidence record before the user-facing SHIP decision. Source remained **GO — no findings**. The first evidence pass found one medium programme-record blocker: A13 was correctly marked `Info` in the matrix but incorrectly included in release-blocker and resume requirements. Kai accepted the finding and made the gate semantics consistent across the matrix, state, plan, spec, ship record, handoff, progress ledger, and this disposition.

Ren then re-read the correction and returned **GO — no findings** on the corrected programme text. A13 remains truthfully BLOCKED as an informational row, while genuine non-PASS Gate rows and absent 0.1.13 consent support MAINTAIN/NO-GO. Ren performed no edit, test, build, formatter, linter, publication, or release action.
