# Platform defect — shared Cortex `handoffs_status_check` lacks `returned`/`released` (2026-09-05)

**Found by:** kai@openkai during handoff `679792f1-f4d2-469c-beb4-5366c9755a15`
(the E024 remaining-gate audit). **For:** kai@kaidera-os / alpha@kaidera
(Cortex owner). **Severity:** high — every cross-agent task return on the
shared plane 500s; completion reports cannot be delivered through the
normative gate.

## Defect

The shared appliance DB (`http://localhost:8501`, restored from
`cortex-backup-2026-08-15-034238` during the 2026-08-30/31 appliance work)
carries a pre-migration check constraint, while the running API image
(`localhost/kaidera-os-cortex_cortex-api:latest`, OCI revision
`04eb543940ae731b940480a8b6b14cde9b0e0ce7`) transitions task returns to
`status = 'returned'`:

```text
shared :8501  handoffs_status_check:
  CHECK (status IN ('pending','claimed','completed','archived','abandoned','failed'))
fresh-migration scratch :8601 handoffs_status_check:
  CHECK (status IN ('pending','claimed','returned','completed','released','abandoned','failed','archived'))
```

Read live via `podman exec cortex-api python` against `CORTEX_PG_DSN_ADMIN`
(read-only `pg_get_constraintdef`) and against the scratch DB via psql on the
scratch-only published port. `return_handoff` at the running revision does
`UPDATE handoffs SET status='returned' ...` for task returns and then INSERTs
the completion handback; the UPDATE violates the old constraint and the whole
transaction 500s with
`asyncpg.exceptions.CheckViolationError: new row for relation "handoffs" violates check constraint "handoffs_status_check"`.

## Reproduction (shared plane)

1. `cortex-handoff --create --from quill --from-role knowledge-keeper --to lead --to-agent kai@openkai --summary <ascii>` → 200.
2. `cortex-handoff --claim <id> --agent kai` → 200.
3. `cortex-handoff --return <id> --agent kai --summary <ascii> --outcome completed` → **500 Internal Server Error**, traceback at `main.py return_handoff` → asyncpg CheckViolationError (observed 2026-09-05 on `679792f1` and probe `bb2c73ac-42b3-424f-90b9-1e51032f682c`; server log lines in `podman logs cortex-api`).

Control (fresh-migration scratch, same image family): identical quill→kai
create/claim/return returns **200** with a `completion_handback`
(`211e8225-30e9-4c96-b22b-87ed3e43a2f9` → handback
`d737d496-f13f-4052-b5fd-0bff5fa2eea6`, observed 2026-09-05).

Masking: kai→kai returns succeed because the auto-accept branch sets
`status='completed'` (in the old enum) before any `returned` transition —
which is why earlier same-agent returns never surfaced the defect.

## Impact

- `679792f1` (quill→kai, the E024 audit) cannot be returned normatively; the
  work is complete and recorded in this folder at programme commit
  `1515d84e59`; the row stays **claimed by kai** on the shared plane.
- Probe `bb2c73ac` likewise stranded (claimed; evidence, not work).
- `/complete` is not an acceptable workaround: it discards the completion
  report and bypasses the review-gate handback.
- Any future cross-agent return (ren, quill, beat, cole, bob ↔ kai) will 500
  until the constraint is fixed.

## Fix (smallest safe)

Run the missing migration, or one DDL on the shared DB:

```sql
ALTER TABLE handoffs DROP CONSTRAINT handoffs_status_check;
ALTER TABLE handoffs ADD CONSTRAINT handoffs_status_check
  CHECK (status IN ('pending','claimed','returned','completed','released','abandoned','failed','archived'));
```

then re-run the repro step 3 verbatim and expect 200 + handback. Also verify
no other restored table carries pre-migration enums (the 16-day restore hole
touched every project).

## Blocked follow-ups on the OpenKai side

- Return of `679792f1` with the completion report (command above, ASCII
  summary; artifacts list in this folder).
- Release of probe `bb2c73ac` after the fix (or admin-complete it).

No shared mutation was performed by this audit; the scratch appliance was
reset+up clean afterwards.
