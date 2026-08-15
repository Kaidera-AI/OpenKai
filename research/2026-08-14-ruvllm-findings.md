# ruvLLM findings — 2026-08-14

Target: https://github.com/ruvnet/RuVector/tree/main/examples/ruvLLM (the `ruvLLM` example subtree of RuVector), plus the crates it wraps (`crates/ruvllm`, `crates/ruvllm-cli`, `crates/ruvllm-wasm`, `crates/sona`), which is where the real substance lives.

## 1. What it is

ruvLLM is **not** a generic local-LLM inference stack in the llama.cpp/Ollama sense; it is a **self-learning LLM orchestration layer**: frozen foundation models + HNSW vector memory + a tiny learned router (FastGRNN) + SONA ("Self-Optimizing Neural Architecture", three temporal LoRA/EWC learning loops). The `examples/ruvLLM` directory is a demo wrapper (its `Cargo.toml` depends on the real crate at `../../crates/ruvllm`, aliased `ruvllm-lib`). The actual engine is `crates/ruvllm`, published on crates.io as `ruvllm 2.3.0` with `ruvllm-cli 2.3.0`, `ruvllm-wasm 2.0.0` (npm `@ruvector/ruvllm-wasm 2.0.2`, `@ruvector/ruvllm 2.6.2`), and `ruvector-sona 0.2.1`.

Maturity signals: parent repo 4,419 stars / 583 forks, pushed 2026-08-14 (MIT licence per GitHub API). Example subtree last touched 2026-08-12; `crates/ruvllm` last touched 2026-07-17. So: an actively developed research-grade crate family with an example-grade demo shell around it. README marketing ("~7,500x vs GPT-4o") measures orchestration overhead only, not generation — it says so itself, one paragraph later.

## 2. Architecture map

```
RuVector/ (Rust workspace, MIT)
├── examples/ruvLLM/                    # demo wrapper — the assigned subtree
│   ├── src/orchestrator.rs             # RuvLLM: 8-step pipeline coordinator (406 lines)
│   ├── src/router.rs                   # FastGRNNRouter: sparse+low-rank GRNN routing net (904 lines)
│   ├── src/memory.rs                   # HNSW memory service over ruvector-core
│   ├── src/attention.rs                # 8-head graph attention for context ranking
│   ├── src/embedding.rs                # embedding service (hash-based default; lattice-embed opt-in)
│   ├── src/inference.rs                # InferencePool — MOCK by default (SIMD mock models)
│   ├── src/inference_real.rs           # candle quantized_llama GGUF path (feature real-inference)
│   ├── src/simd_inference.rs           # AVX2/AVX512/SSE4.1 CPU transformer
│   ├── src/sona/{engine,lora,ewc,reasoning_bank,trajectory,loops/*}.rs
│   ├── src/napi.rs                     # N-API Node bindings (crate-type cdylib)
│   ├── src/bin/{demo,server,bench,benchmark_suite,simd_demo,pretrain,export}.rs
│   ├── esp32/ + esp32-flash/           # no_std microcontroller port + flashing toolchain
│   └── docs/SONA/00..09-*.md           # SONA design docs
├── crates/ruvllm/                      # THE REAL CRATE (ruvllm 2.3.0 on crates.io)
│   ├── src/backends/mod.rs             # LlmBackend trait + Candle/Lattice/CoreML/Mistral/Noop
│   ├── src/gguf/                       # own GGUF parser/loader/quantization
│   ├── src/kernels/                    # NEON/AVX Flash-Attention-2, GEMM/GEMV, RoPE, norms
│   ├── src/metal/ + shaders/*.metal    # native Metal compute (M4-optimised)
│   ├── src/serving/                    # continuous-batching scheduler, KV cache manager
│   ├── src/speculative.rs              # draft/verify speculative decoding
│   ├── src/context/                    # context_manager, episodic_memory, semantic_cache, working_memory
│   ├── src/reflection/                 # reflective_agent, confidence, error_recovery, perspectives
│   ├── src/claude_flow/                # agent_router, model_router (Haiku/Sonnet/Opus), task_classifier
│   ├── src/training/                   # grpo.rs, mcp_tools.rs, contrastive.rs, real_trainer.rs
│   ├── src/lora/ + src/quantize/ + src/qat/ + src/bitnet/
│   └── src/reasoning_bank/ + src/sona/ + src/evaluation/ (SWE-bench harness)
├── crates/ruvllm-cli/                  # ruvllm download|list|info|chat|serve|quantize|benchmark
└── crates/ruvllm-wasm/                 # WASM: KV cache, arena alloc, chat templates, HNSW router,
                                        # MicroLoRA, WebGPU WGSL shaders, web-worker pool
```

Process model: single-process async Rust (tokio), library-first (`rlib`; example also `cdylib` for N-API). `ruvllm serve` runs an OpenAI-compatible HTTP server. No external services; memory is embedded `ruvector-core` HNSW. WASM build runs in-browser with optional WebGPU and web workers.

## 3. Capability inventory (contract-scoped)

- **Multi-provider abstraction**: `LlmBackend` trait (`crates/ruvllm/src/backends/mod.rs`) — `load_model / generate / generate_stream_v2 / get_embeddings / tokenizer`, impls: `CandleBackend` (default-on), `LatticeBackend` (pure-Rust Qwen3.5 Metal, macOS-only, default-OFF), `CoreMLBackend` (Apple Neural Engine), `MistralBackend` (**stub** — the `mistralrs` dependency is commented out in Cargo.toml as "not yet on crates.io"), `NoopBackend`. This is a local-backend abstraction, **not** a remote-provider (OpenAI/Anthropic) abstraction.
- **TUI tech**: none. `ruvllm-cli chat` is a plain REPL with `/commands`; no ratatui/TUI framework anywhere.
- **Session/context management**: example `orchestrator.rs` keeps `DashMap<String, Session>` with router hidden state carried across turns (stateful router); `crates/ruvllm/src/context/` has `context_manager.rs` (per-model token budgets, 80% rule, priority scoring, summarisation), `episodic_memory.rs` (HNSW-indexed trajectories, auto-compression after 7 days at ratio 0.5), `semantic_cache.rs` (HNSW-indexed **tool-result cache**, similarity threshold 0.85, TTL, LRU eviction), `working_memory.rs`. KV cache: `kv_cache.rs`, `paged_attention.rs`, `serving/kv_cache_manager.rs`, TurboQuant 2–4-bit KV quantisation.
- **Subagent/orchestration**: `claude_flow/` module — `agent_router.rs` (task → 8 agent types via SONA-learned routing), `model_router.rs` (Haiku/Sonnet/Opus by token threshold + cost estimation), `task_classifier.rs`, plus federated learning in `crates/sona/src/training/federated.rs` (ephemeral agents export trajectories to a quality-gated central coordinator). No general subagent-spawning harness like omp's.
- **Memory/vector/embeddings**: everything rides on `ruvector-core` HNSW. Default example embeddings are hashing-based; a real pretrained embedder (`lattice-embed 0.6`) is opt-in via feature `lattice-embeddings` (raises MSRV to Rust 1.93). SONA adds ReasoningBank pattern store (K-means++, 100 clusters) and MicroLoRA/BaseLoRA with EWC++.
- **Packaging/distribution as an embeddable module**: crates.io `ruvllm` (rlib), N-API Node package `@ruvector/ruvllm` (prebuilt binaries for 5 targets), wasm-pack npm `@ruvector/ruvllm-wasm`, cargo-installable `ruvllm-cli`. This is the most "installable module" packaging seen across the research set.

## 4. Delta findings (NOT in the KOS baseline)

1. **SONA three-loop learning is a concrete, implemented answer to KOS's "trajectories pruned hourly unmined" gap.** Loop A: per-request MicroLoRA (rank 1–2) applied in <100µs; rank-2 benchmarked ~5% faster than rank-1 due to SIMD alignment. Loop B: hourly K-means++ pattern extraction (100 clusters, 1.3ms search) folded into BaseLoRA (rank 4–16). Loop C: weekly "dream" consolidation with EWC++ (online Fisher, EMA decay 0.999, λ=2000 claimed optimal, circular 10-task buffer, automatic task-boundary detection). Export path: LoRA weights as PEFT-compatible safetensors, patterns as JSONL, DPO preference pairs, push to HF Hub (`examples/ruvLLM/src/bin/export.rs`, `crates/sona/src/export/`).
2. **Federated learning coordinator matches KOS's handoff/dispatch shape**: `EphemeralAgent` processes tasks, calls `export_state()` on termination; `FederatedCoordinator` (50K trajectory capacity) aggregates with a **quality threshold of 0.4**, auto-consolidates every 50 agents, and hands `get_initial_patterns(n)` back to warm-start new agents (`crates/sona/src/training/federated.rs`). Directly transplantable onto KOS subagent dispatch + Cortex.
3. **Semantic tool-result cache** (`crates/ruvllm/src/context/semantic_cache.rs`): HNSW-indexed cache of tool outputs, hit on cosine ≥ 0.85, per-entry TTL, LRU eviction. KOS has no equivalent; this is a small, self-contained pattern.
4. **Stateful per-session router**: FastGRNN (sparse 90%-zero W + rank-8 low-rank U) outputs 5 heads — model-select (4 classes), context-size bucket, temperature, top-p, confidence — and its **hidden state is persisted in the Session between turns** (`orchestrator.rs` steps 4 and session update), so routing improves within a conversation. Router itself is trained via the learning service from feedback signals (`learning.rs`, quality threshold 0.7 default).
5. **Serving engineering worth stealing**: continuous-batching scheduler with explicit preemption modes (`Recompute` vs `Swap` KV to CPU), priority policies (FCFS/SJF/PriorityBased/Adaptive), request coalescing window, and speculative decoding with a recommended draft-pairing table (`crates/ruvllm/src/serving/scheduler.rs`, `speculative.rs`).
6. **Reflection wrapper for agent quality gating** (`crates/ruvllm/src/reflection/`): retry-with-error-context (backoff config), confidence checker ("IoE strategy"), multi-perspective critique, and an `ErrorPatternLearner` that turns recoveries into routing signal. KOS currently has **no quality gate** — this is a pattern-level candidate, not a dependency.
7. **GRPO tool-use training**: `training/grpo.rs` + `training/mcp_tools.rs` implement critic-free group-relative policy optimisation specifically to improve tool selection/parameter generation over "140+ Claude Flow MCP tools" — trajectory-driven RL for tool calling, relevant to OpenKai's tool-loop quality.
8. **Honest-maturity tells**: the example's default inference path is a **mock** (`src/inference.rs` InferencePool with SIMD mock models); real generation needs feature `real-inference` (candle `quantized_llama`, 4 small GGUF models: SmolLM-135M/360M, Qwen2-0.5B, TinyLlama-1.1B). `mistral-rs` backend is a non-compiling stub (dep commented out). The async stream wrapper busy-spins (`cx.waker().wake_by_ref()` then `Poll::Pending`, `backends/mod.rs`). Example subtree contains a committed macOS RTFD (`examples/ruvLLM/modules/plans/spec.txt.rtfd`) and an orphan root file `task_specific_adapters.rs`. ESP32 port README is admirably explicit about measured vs simulated vs projected numbers.
9. **WASM package is primitives, not a turnkey browser model runner**: `@ruvector/ruvllm-wasm` ships KV cache, arena allocator, chat templates (llama3/mistral/qwen/chatml/phi/gemma), HNSW router, MicroLoRA, SONA-instant, WebGPU WGSL kernels (attention/matmul/norm/softmax) and a SharedArrayBuffer worker pool — but the public API surface shows no `load_model(weights)` end-to-end transformer path [INFERENCE from README API tables; `crates/ruvllm-wasm/src/lib.rs`]. "5.5 KB runtime" claim unverified [UNVERIFIED].
10. **ANE/CoreML + hybrid GPU/ANE pipeline** (`backends/coreml_backend.rs`, `backends/hybrid_pipeline.rs`): routes MLP ops to Apple Neural Engine and attention to GPU, with per-op routing decisions. Unique among surveyed harnesses; Apple-only.
11. **Latency honesty**: README's own latency breakdown attributes 40% of orchestration time to "generation" that is mock — real end-to-end numbers only exist in `crates/ruvllm` benches (`benches/e2e_bench.rs`, `serving_bench.rs`) which I did not execute [UNVERIFIED performance].

## 5. Reuse verdict for OpenKai

| Item | Verdict | Rationale / licence constraint |
|---|---|---|
| SONA three-loop learning (MicroLoRA/BaseLoRA/EWC++) | **Adapt pattern** | Direct fix for KOS's unmined-trajectory gap; but Rust-only — port the loop schedule + quality gating into Cortex jobs, don't link the crate. MIT. |
| Federated trajectory aggregation (quality threshold, warm-start patterns) | **Adapt pattern** | Maps 1:1 onto KOS handoff-filed dispatch + Cortex memory; solves cross-agent learning. MIT. |
| Semantic tool-result cache (HNSW + TTL + LRU, threshold 0.85) | **Adapt pattern** | Small; implement against pgvector in Cortex rather than importing ruvector-core. MIT. |
| `LlmBackend` trait + `create_backend()` precedence | **Ignore** (KOS already has a provider abstraction) | It abstracts *local* backends only; no remote-provider routing. Note the NoopBackend default-off pattern as trivia. |
| `ruvllm serve` (OpenAI-compatible local server) | **Adopt as optional dependency, cheaply** | If OpenKai wants an offline/cheap sidekick lane for E016 FU-6 fusion, spawning `ruvllm serve` (or Ollama — equivalent shape) behind the existing provider interface is the low-cost path; no FFI. MIT. Integration cost: low (subprocess + HTTP), but model quality ceiling is small GGUFs. |
| Local embeddings via `lattice-embed` | **Ignore for now** | MSRV 1.93, Rust-only; Cortex already has pgvector — a local embedding lane is better served by an existing Python/TS embedder. Revisit only if API embedding cost becomes the blocker. |
| WASM/WebGPU browser inference (`@ruvector/ruvllm-wasm`) | **Ignore for OpenKai TUI** | TUI is terminal, not browser; the WASM package lacks turnkey model loading [INFERENCE]. If a web surface ever appears, transformers.js is the more turnkey route. |
| Reflection wrapper + ErrorPatternLearner | **Adapt pattern** | Candidate mechanism for the missing KOS quality gate (retry-with-context, confidence check, learned error patterns). MIT. |
| FastGRNN learned router | **Adapt pattern (later)** | Learned cost/quality routing across KOS's 4 harness lanes is attractive, but a tiny Rust model doesn't port; the *idea* (5-head router: model/context/temperature/top-p/confidence, session-persistent state) is the takeaway. |
| ESP32 subtree | **Ignore** | Microcontroller federation is out of scope; only its measured/simulated/projected benchmark labelling discipline is worth copying. |
| Metal/ANE hybrid pipeline, TurboQuant KV, GGUF parser, QAT/BitNet | **Ignore** | Kernel-level R&D, far below OpenKai's abstraction layer. |

**Net**: nothing here should become a hard dependency of OpenKai's core. The value is architectural: SONA's temporal learning loops + federated quality-gated aggregation are the most directly mined mechanisms for Cortex evolution, and `ruvllm serve` is a viable *optional* offline lane for FU-6 fusion at subprocess cost. Maturity: example-grade wrapper around a genuinely published but research-grade crate family; expect sharp edges (mock defaults, stubbed backends, marketing-grade benchmark headlines).

## 6. Citations

- Example subtree tree: https://github.com/ruvnet/RuVector/tree/main/examples/ruvLLM (listing via https://api.github.com/repos/ruvnet/RuVector/git/trees/main?recursive=1)
- Example README (SONA loops, benchmarks, mock disclaimer): https://github.com/ruvnet/RuVector/blob/main/examples/ruvLLM/README.md
- Example manifest (wraps `crates/ruvllm` as `ruvllm-lib`; features): https://github.com/ruvnet/RuVector/blob/main/examples/ruvLLM/Cargo.toml
- Orchestrator 8-step pipeline + session router state: https://github.com/ruvnet/RuVector/blob/main/examples/ruvLLM/src/orchestrator.rs
- Mock-by-default inference pool: https://github.com/ruvnet/RuVector/blob/main/examples/ruvLLM/src/inference.rs
- Candle GGUF path (SmolLM/Qwen2/TinyLlama): https://github.com/ruvnet/RuVector/blob/main/examples/ruvLLM/src/inference_real.rs
- `LlmBackend` trait, backends, stubbed mistral-rs, async spin: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/src/backends/mod.rs and https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/Cargo.toml
- Continuous batching scheduler: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/src/serving/scheduler.rs; serving engine: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/src/serving/engine.rs
- Speculative decoding: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/src/speculative.rs
- Context manager / episodic memory / semantic tool cache: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/src/context/{context_manager,episodic_memory,semantic_cache}.rs
- Reflection wrapper: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/src/reflection/reflective_agent.rs
- Agent/model routing (claude_flow): https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/src/claude_flow/{mod,agent_router}.rs
- GRPO + MCP tool training: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/src/training/{grpo,mcp_tools}.rs
- Federated learning: https://github.com/ruvnet/RuVector/blob/main/crates/sona/src/training/federated.rs
- WASM package: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm-wasm/README.md and https://github.com/ruvnet/RuVector/tree/main/crates/ruvllm-wasm/src/webgpu
- CLI: https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm-cli/README.md
- ESP32 port: https://github.com/ruvnet/RuVector/blob/main/examples/ruvLLM/esp32/README.md
- Crate README (feature table, "learns from every request"): https://github.com/ruvnet/RuVector/blob/main/crates/ruvllm/README.md
- Publication status: crates.io sparse index entries `ruvllm 2.3.0`, `ruvllm-cli 2.3.0`, `ruvllm-wasm 2.0.0`, `ruvector-sona 0.2.1`, `ruvllm-esp32 0.3.2`; npm `@ruvector/ruvllm-wasm 2.0.2` (2026-03-17), `@ruvector/ruvllm 2.6.2` (registry.npmjs.org)
- Repo metadata (stars, MIT, activity): https://api.github.com/repos/ruvnet/RuVector
- Commit recency: https://api.github.com/repos/ruvnet/RuVector/commits?path=examples/ruvLLM and ?path=crates/ruvllm

**Licence**: MIT (workspace `Cargo.toml` + GitHub API). READMEs and `crates/sona` additionally carry dual MIT/Apache-2.0 texts (`examples/ruvLLM/README.md` §License, `crates/sona/LICENSE-{MIT,APACHE}`). Both permissive; no reuse constraint.
