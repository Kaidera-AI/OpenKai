# openkai/ — the OpenKai layer (E021 fork spike)

Everything OpenKai-specific lives in this directory, behind omp's extension
seams. Upstream (packages/, root configs) stays pristine for merge-cadence.

Planned contents (per Program/Release_v0.1.011/E021_FORK_OMP_SPIKE):

- `fusion/` — the fusion panel/synthesis/gate as a CustomTool (F1)
- `shift/` — switchyard tier routing via model-resolver hooks (F2)
- `orchestrate/` — the Orchestrator (posture/pins/latch/cascade) (F2)
- `rlm/` — recursive delegation: admission handles + usage attribution (F4)
- `cortex-memory/` — the Cortex memory capability provider (F1)
- `gate-floor/` — the deny floor as an AgentBeforeModelCall rule (F3)
- `served/` — hub + headless host as an Extension (F3)
- `keywords/` — magicKeywords settings + hook (F3)
- `brand/` — Kaidera theme + splash + chips (F0, themes landed)

Provenance: fork of can1357/oh-my-pi @ v18.0.0 (MIT — copyright Mario Zechner,
Can Bölük, Stencil Labs; LICENSE retained upstream). OpenKai layer: Kaidera.
