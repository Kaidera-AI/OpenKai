# Non-shared Cortex test appliances for the E024 acceptance drives (handoff 138a96cc)

Set up by kai@kaidera-os on 2026-09-04 with `appliance/dev/cortex-test.sh` (KOS canonical
`kai/e020-runtime-fixes-20260822`, commit 2611dc59). Same appliance compose file as the
shared stack, separate podman-compose project, own volumes/network/secrets/ports; the shared
`:8501` stack is never touched. Written into this evidence folder for the OpenKai lane to
commit; kai does not commit in the OpenKai repository.

## (B) Mac scratch stack `cortex-test` — READY

| Item | Value |
|---|---|
| API | `http://127.0.0.1:8601` (podman machine `kos-e020-uat`, published to the Mac loopback) |
| Admin token | `X-Cortex-Admin-Token` = `KOS_CORTEX_ADMIN_TOKEN` in `~/Library/Application Support/Kaidera OS/cortex-test/cortex-test.env` (0600; never printed; also holds the DB/app passwords and `KOS_HARNESS_TOKEN`) |
| OpenKai env | `CORTEX_API_URL=http://127.0.0.1:8601`, `CORTEX_API_TOKEN=<that admin token>`, `CORTEX_PROJECT=openkai-acceptance` |
| Containers | `cortex-test_db_1`, `cortex-test_migrate_1` (one-shot), `cortex-test_cortex-api_1`, `cortex-test_project-bootstrap_1` (one-shot, no-op: no default project), `cortex-test_embed-worker_1`; no console, graph or pdf worker (add with `CT_WORKERS="embed-worker graph-worker"`) |
| Volumes | `cortex-test-state`, `-config`, `-secrets`, `-graphs`, `-models` plus tmpfs `cortex-test_kos-home-*` |
| Network | `cortex-test_kos` (bridge) |
| Reset | `appliance/dev/cortex-test.sh reset` (stops, deletes only these volumes, keeps the env/tokens) then `appliance/dev/cortex-test.sh up`; proven: after reset `GET /projects` = 0 projects |
| Status | `appliance/dev/cortex-test.sh status`; `down` keeps volumes |
| Install channel | source-built appliance images `localhost/kos/{db,migrate,cortex,project-bootstrap,embed-worker}:dev`, OCI label revision `bfbf9134ea2dc5eb255ffb730828fa5fa50d0768` (`kos build` of the Mac cutover, source `https://github.com/Kaidera-AI/kaideraos`); `CT_REPO` must be a checkout whose `appliance/appliance.yml` matches those images (canonical differs from bfbf9134 only by five DB tuning env lines) |
| API version | `/health` reports `version 2.3`, surface `kaidera-os-e006-inc01-2026-06-01`, `embed_provider local`, `embed_model sentence-transformers/all-mpnet-base-v2`, `embed_dims 768` |

### Registered for the drives
`openkai-acceptance` (display "OpenKai acceptance", root `/projects/openkai-acceptance`,
`default_agent probe`, status active) with roster `probe:probe` (writer_scope work).
Registered through `POST /projects` with `X-Cortex-Project-Mode: create-only` — note the API
requires `repo_root` or one `roots[]` entry (400 without it); the CLI `cortex-init-project`
cannot be used from the KOS workspace because the isolation guard blocks a foreign
`CORTEX_PROJECT` (one-off override only).

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

### Shared stack untouched (before and after every step)
`http://127.0.0.1:8501/health` healthy, version 2.3; `GET /projects` = 13; container
`cortex-api` "Up 20 hours (healthy)" throughout; no shared volume or container was named by
any command (`cortex-test.sh` only ever addresses `cortex-test*`).

## (A) kos-test Linux scratch stack — PENDING (host unreachable)

Plan: same tool with `CT_REPO=~/kaidera-os` (the checkout that built kos-test's
`localhost/kos/*:dev` images, 0.2.005@389b9cbf), API on `127.0.0.1:8601` (OpenKai 0.1.12 on
the same host reaches it on loopback), env at `~/.local/share/kaidera-os/cortex-test/cortex-test.env`,
console not started (the appliance console owns 8765). kos-test answered SSH for the
read-only inventory at 12:2x Dubai (Rocky 10.2, podman 5.8.2, six appliance containers
healthy, 3.7 GB free) and then timed out on every attempt from 12:4x; a 30-minute waiter is
running. Disk note: the scratch stack shares the images and adds only its volumes; the
embed-worker model cache is the largest addition.
