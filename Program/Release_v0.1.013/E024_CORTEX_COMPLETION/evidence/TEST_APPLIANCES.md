# Non-shared Cortex test appliances for the E024 acceptance drives (handoff 138a96cc)

Set up by kai@kaidera-os on 2026-09-04 with `appliance/dev/cortex-test.sh` (KOS canonical
`kai/e020-runtime-fixes-20260822`; the seven-role default and the idempotent `up` landed after 2611dc59). Same appliance compose file as the
shared stack, separate podman-compose project, own volumes/network/secrets/ports; the shared
`:8501` stack is observation-only and was not mutated (the rejected HTTP 403 attempt is
recorded below). Written into this evidence folder for the OpenKai lane to commit; kai does
not commit in the OpenKai repository.

## (B) Mac scratch stack `cortex-test` — READY

| Item | Value |
|---|---|
| API | `http://127.0.0.1:8601` (podman machine `kos-e020-uat`, published to the Mac loopback) |
| Admin token | `X-Cortex-Admin-Token` = `KOS_CORTEX_ADMIN_TOKEN` in `~/Library/Application Support/Kaidera OS/cortex-test/cortex-test.env` (0600; never printed; also holds the DB/app passwords and `KOS_HARNESS_TOKEN`) |
| OpenKai env | `CORTEX_API_URL=http://127.0.0.1:8601`, `CORTEX_PROJECT=openkai-acceptance`, `OPENKAI_AGENT=probe`; `CORTEX_ADMIN_TOKEN` is loaded process-only when an admin route is required. The admin token is **not** reused as `CORTEX_API_TOKEN`/Bearer auth. |
| Containers (all seven roles) | `cortex-test_db_1`, `cortex-test_migrate_1` (one-shot), `cortex-test_cortex-api_1`, `cortex-test_project-bootstrap_1` (one-shot, no-op: no default project), `cortex-test_graph-worker_1`, `cortex-test_embed-worker_1`, `cortex-test_pdf-worker_1`; no console (the console is native under R5) |
| Volumes | `cortex-test-state`, `-config`, `-secrets`, `-graphs`, `-models` plus tmpfs `cortex-test_kos-home-*` |
| Network | `cortex-test_kos` (bridge) |
| Reset | `appliance/dev/cortex-test.sh reset` (stops, deletes only these volumes, keeps the env/tokens) then `appliance/dev/cortex-test.sh up`; proven: after reset `GET /projects` = 0 projects |
| Status | `appliance/dev/cortex-test.sh status`; `down` keeps volumes |
| Install channel | source-built appliance images `localhost/kos/{db,migrate,cortex,project-bootstrap,graph-worker,embed-worker,pdf-worker}:dev`, OCI label revision `bfbf9134ea2dc5eb255ffb730828fa5fa50d0768` (`kos build` of the Mac cutover, source `https://github.com/Kaidera-AI/kaideraos`); `CT_REPO` must be a checkout whose `appliance/appliance.yml` matches those images (canonical differs from bfbf9134 only by five DB tuning env lines) |
| API version | `/health` reports `version 2.3`, surface `kaidera-os-e006-inc01-2026-06-01`, `embed_provider local`, `embed_model sentence-transformers/all-mpnet-base-v2`, `embed_dims 768` |

### Transient registration used by each drive
Each mutating drive resets the scratch stack, then creates `openkai-acceptance` (display
"OpenKai acceptance", root `/projects/openkai-acceptance`, `default_agent probe`, status
active) with roster `probe:probe` (writer_scope work). Registration uses `POST /projects`
with `X-Cortex-Project-Mode: create-only`; the API requires `repo_root` or one `roots[]`
entry. Every final candidate driver resets and restarts the scratch stack in `finally`,
then requires `GET /projects/openkai-acceptance` = 404. The project is therefore absent
between drives and at handoff.

### Embedding options (A12/A13)
`GET/PATCH /admin/cortex/config` with the admin token, body `{"embedding_provider": ...,
"embedding_model": ...}`. Proven on 2026-09-04: `local` / `sentence-transformers/all-mpnet-base-v2`
→ `openrouter` / `nvidia/llama-nemotron-embed-vl-1b-v2:free` → back to `local`, all
`PATCH 200`, readback exact. The stack has NO provider keys (no console, so no provider
projection): `openrouter` is selectable but keyless; A13's NVIDIA rerank needs the operator's
key placed by the drive (the default rerank is `local` / `cross-encoder/ms-marco-MiniLM-L6-v2`,
`rerank_enabled true`). `ollama/nomic-embed-text` is NOT wired: the appliance has no Ollama
role and the Mac's `:11434` is oMLX; treat A12's ollama variant as a PATCH-only check unless an
Ollama endpoint is provided.

### How an embed-worker outage surfaces (measured; differs from the handoff's assumption)
With `podman stop cortex-test_embed-worker_1`:
- `POST /knowledge/ingest` still returns `created:true, embedded:false` (by design: ingest
  never embeds inline);
- `POST /beat/embeddings/backfill` returns `processed 1, embedded 0, errors 1`;
- `GET /admin/cortex/doctor` shows `null_embeddings 1` for the table (the backlog check stays
  `ok` while the count is under its threshold);
- `GET /degradation` returns `{"degraded": []}` — it is PATTERN-based (search-pattern
  metrics) and does not represent worker outages; `POST /search` still answers over bm25
  with `degraded: []`.
With the worker restarted: backfill `embedded 1, errors 0`, doctor `null_embeddings 0`,
search `reranked true`. So the operator-visible signals are the backfill receipt and the
doctor counts, not `/degradation`; the drives' "degradation empty" expectation after a
PATCH holds, but "degradation reports the outage" does not with today's API.

### Bootstrap re-run finding (appliance lane)
Re-running `project-bootstrap` on an already initialised stack fails with
`state layout is not writable: [Errno 1] Operation not permitted: '/graphs'` (the graphs
volume showed mode `1755` after the rerun path); a fresh seven-role start leaves `/graphs`
at `0750` with every role healthy. The tool therefore never re-runs a completed one-shot;
`kos up` should be checked for the same behaviour on an initialised appliance.

### Shared stack untouched
The shared `http://127.0.0.1:8501` stack remained observation-only. Exact-candidate A3
issued status reads and observed health v2.3, the registered `openkai` project, default
writer `kai`, configured embedding/rerank models, a healthy embed worker, and no reported
degradation. One earlier command accidentally inherited ambient authentication and
attempted an admin PATCH; Cortex rejected it with HTTP 403 and no mutation. Every later
scratch driver explicitly cleared bearer-token variables. No shared volume or container
was addressed; `cortex-test.sh` only ever names `cortex-test*`.

## (A) kos-test Linux scratch stack — SUPERSEDED by the new kos-test VM

The old kos-test (i-0cde39d1d405adeca) stopped answering SSH at ~12:40 Dubai on 2026-09-04
and is being replaced: Ren is installing a fresh kos-test VM (one kos-test at a time; the
old instance is decommissioned after an AMI snapshot). The scratch stack lands there after
the user-path dress rehearsal (handoff de4c08c3), with the same tool: `CT_REPO=<the checkout
that built that host's localhost/kos/*:dev images> appliance/dev/cortex-test.sh up`, API on
`127.0.0.1:8601`, env at `~/.local/share/kaidera-os/cortex-test/cortex-test.env`, then
`POST /projects` for `openkai-acceptance` + `probe` exactly as on the Mac. Until then the
Mac stack above is the only scratch appliance.
