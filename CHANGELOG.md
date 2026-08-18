# Changelog

All notable changes to OpenKai are documented here. The project adheres to [Semantic Versioning](https://semver.org/); the release tag style is `v0.01.001` (npm-normalised as `0.1.1`).

## [0.1.7] — v0.1.007 (E017: orchestration composition — shift predicts, fusion multiplies, the gate verifies)

The composition epic: the 0.1.6 machinery (K3-certified but callerless) is
now wired end-to-end, visible in the TUI, and learning from its own gate
outcomes. Design base: OK-9 (`research/2026-08-18-shift-fusion-orchestration-ADR.md`).
**326/326 tests green; typecheck clean.**

### Orchestration (E017)
- **`Orchestrator` facade** (`core/orchestrate.ts`): one decision layer —
  stage classify → per-stage tier latch (no mid-phase thrash) → override
  rules → corroborative scorer → pin clamps → posture default. Session
  sessions route through it: tool signals accumulate from the event stream
  and the tier is decided before each prompt (evidence-only: no signals, no
  switch); compaction re-evaluates with the latch bypassed (the free switch
  point).
- **Cascade completion**: a fusion gate halt escalates the stage one tier
  and retries exactly once, labelled on the feed (FrugalGPT's move).
- **Reward loop**: gate outcomes write bandit posteriors per bucket
  (`noteGateOutcome`); priors feed cast/pair selection.
- **Operator priorities (OK-9.7)**: `shift.posture` (quality/balanced/saver)
  + floor/ceiling pins + `never` denylists in `~/.openkai/config.json`;
  settings gains a **routing tab**; precedence: pin → override → posture →
  bandit → stage default.
- **Synthesis (OK-9 W4)**: compare-then-compose contract (pairwise
  comparison, then the merge); synthesiser resolved as judge-first, never a
  panel member; parse failure keeps both role outputs, flagged.
- **Calibration (OK-9 W6/W7)**: `openkai fusion calibrate` — RESCUE/LOSS/
  SAFE/HARD quadrant table, threshold sweep with the Switchyard selection
  rule, CPT/APGR report, judge break-even meter; dated records under
  `research/calibration/`.

### TUI visibility (S1)
- **Tier chip** in the status line with transition flash (`t:eff▸cap`) fed
  by live routing events.
- **Fusion role pills** on panel blocks; failed roles keep their pill with
  the attributed error; gate verdicts render as notices.
- **`/shift`** — the session routing ledger (stage/tier/source/rationale
  from the activity feed). **`/diff`** — scrollable overlay diffing the
  latest shadow snapshot against the work tree (ren's TUI research item).

### Providers & steering
- **Ollama lanes**: `ollama` (keyless local, live-probed) and `ollama-cloud`
  (`OLLAMA_API_KEY`) — dynamic model lists via `/api/tags`.
- **Provider table completeness**: huggingface, baseten, google-vertex,
  cloudflare lanes, opencode/-go, ant-ling, regional token plans and more —
  with deliberate skips (bedrock/azure ambient auth) recorded.
- **Subagent steering**: `steerChild`/`activeChildren` — the parent can
  steer a live child by session id; task results carry the id.
- Feature toggle `shift` (default on) for in-session tier routing.

### Registry & process
- `Program/FEATURE_REGISTRY.md` is the release gate (E017 inc 10 walks it).
  The brand splash regression is recorded and restored; `duet`/`search`/
  guided-teaching-turn formally retired (CTO, 2026-08-19).

## [0.1.6] — v0.1.006 (K3 adversarial review + keyless boot)

Two full adversarial passes (ren@openkai's E012 review of 0.1.5, then kai's K3
request against the E014/E015 surface) — 80+ findings reviewed, every
confirmed one fixed and pinned. Plus the fresh-install boot contract: **the
TUI never refuses to start** — missing credentials open sign-in inside the
running shell (CTO directive).

### Boot & first run (0.1.6)
- **Keyless boot**: a machine with no API keys launches the TUI, shows the
  capability row, and auto-opens the sign-in overlay; key/OAuth entry takes
  effect on the next prompt (auth resolves per request). Headless paths
  (`chat`, `serve`) keep their named exits.
- **Single-key provider fallback**: a box with one NVIDIA key boots into the
  NVIDIA lane (not a dead openrouter default); model defaults derive from the
  bundled catalogue, so every lane is bootable offline.
- **One credential store everywhere**: every catalogue/stream call site now
  uses the persistent `FileCredentialStore` factory — OAuth logins survive
  restarts on the fusion lane too.

### K3 review fixes (E014/E015 surface)
- **Tier scorer fidelity** (Switchyard calibration): `failing`/`passing`/
  Jest ✕ recognised; structural `*Error`/`*Exception` matching; plain nonzero
  exits score SOFT 0.3 as calibrated; gate refusals no longer read as tool
  friction; negated passes ("did not pass") count as failure evidence; bash
  writes (`sed -i`, redirection, `tee`) count as production — phantom
  "spinning" misroutes closed.
- **routeWithTier**: per-stage fall-open (plan/review rest on the capable
  member), `defaultTier` option (the OK-9.7 posture seam), full type
  narrowing.
- **task tool**: stage→model resolution threads the cast's provider (was dead
  by default); review stage loud-fails without a `judgeModel`; pre-aborted
  children never start a run; `transport.prompt()` after `close()` rejects;
  outputSchema extractor tries all fenced blocks + balanced spans, reads
  required keys from formal JSON Schema, caps output at 64 KiB; operator
  casts (`~/.openkai/config.json`) plumbed through; `web_fetch` honours the
  caller's AbortSignal.
- **Fusion telemetry**: wrong-shape log lines can't crash the dashboard;
  rotation re-reads + merges before rewriting (concurrent writers kept);
  pair keys provider-qualified; self-pairs render honestly; `__proto__` gate
  keys counted; log-sourced strings stripped of control bytes.
- **Bridge `--listen`** brought to hub posture and made correct: instant ack
  + async relay with event-id dedup (Slack's 3s retries no longer multiply
  paid turns), `url_verification` handshake answered, bot/subtype events
  dropped (self-loop guard), timing-safe bearer compare, 1 MiB body cap,
  Host allowlist, `/health`, request timeout, fixed error contract,
  `--hub-host` for IPv6-bound hubs. Shared `http-common.ts` helpers — one
  hardened implementation for both listeners.

### E012 review fixes (0.1.5 surface, landed with this release)
- **hashline_edit gated** (was an ungated arbitrary file write): approval
  round-trip, deny floor, canonical containment, shadow snapshot.
- **Upgrade trust root**: project `.env` can no longer set `OPENKAI_*` /
  `CORTEX_*` knobs; release-key pin seam (`OPENKAI_RELEASE_KEY` build define,
  fail-closed once pinned); `install.sh` performs the sha256 verification its
  header claimed.
- **MCP**: tools merge (never replace built-ins), execute through the
  permission gate, spawn with a secret-scrubbed environment.
- **Sessions**: resume rehydrates header/seq/parent chain; corrupt JSONL
  tails tolerated; per-session advisory locks.
- **Gate liveness**: abort/close settle pending approvals (`rejectAll`);
  gated `bash` honours abort + timeout; control events can't be dropped by
  the bounded event queue; plan mode enforced at the gate.
- **TUI**: every model/tool render path sanitised (status chip, notices,
  previews, attention); `submit()` busy guard; Ctrl+K palette bound; provider
  errors render as error turns; `/model <id>` works; auto-compact is
  idle-only.
- **Deny floor extended**: ed25519/ecdsa keys, `.npmrc`/`.netrc`/`.pypirc`,
  `.aws`/`.azure`/`.kube`/`.gnupg`, `*.p12`/`*.pfx`/keystores.

### Research (this release's design base)
- `research/2026-08-18-switchyard-routing-fusion-deep-dive.md` — 34+ primary
  sources; what Switchyard is based on (arXiv:2603.20895), routing + fusion
  literature distilled.
- `research/2026-08-18-shift-fusion-orchestration-ADR.md` — OK-9: shift
  predicts, fusion multiplies, the gate verifies; OK-9.7 operator postures
  and pins.
- `research/2026-08-18-e015-research-match-integration-review.md` — the
  S1–S5 landing order (TUI visibility slice, orchestration facade).

**263/263 tests green; typecheck clean; `scripts/security-audit.sh` PASSED.**

## [0.1.5] — v0.1.005 (the harness release: omp functionality, droid feel, Kaidera brand)

Twenty-plus increments (E002–E011) fold the best of omp (functionality) and
droid (look & feel) onto the Kaidera brand mark, per the CTO formula. The
CLI and core bump to 0.1.5 in lockstep.

### Brand & boot
- **Kaidera hex-node mark** (ren): 15-line circuit hexagon for the splash,
  sharp 8-line compact variant for the boot card; gradient engine lifted from
  omp (5-stop truecolour diagonal gradient + shine traversals, 256-colour
  fallback). Splash plays on **every** launch (any key skips; `openkai splash`
  replays). Boot card: hex + wordmark + capability row + daily tip.
- **Theme auto-detection** (OSC 11 query, COLORFGBG fallback, 150ms budget);
  config `theme: auto|dark|light|<pack>`.

### TUI / settings
- **`/settings` vs `/setup` split**: six-tab config panel (appearance /
  providers / model / interaction / memory / features) with status-line
  presets; `/setup` opens onboarding (provider sign-in). `/welcome` removed.
- **In-TUI sign-in**: OAuth device-flow overlay (Claude Pro/Max, Codex, Kimi,
  Copilot) + key-entry overlay writing `~/.openkai/.env` (0600). No hand-editing.
- **Two-sided status line** (omp footer layout): brand glyph + agent +
  provider + `git:<branch>` + persist + session + state + `plan` + `ctx:%`
  left, tokens + model right; presets default/minimal/compact/full.
- **Opaque overlays** (no transcript bleed), `/model` five-level picker
  (provider→model→effort→partner-provider→partner-model) with ctx+cost
  columns, `/models` fullscreen hub (recent/all/per-provider scopes).
- **`/autonomy` picker**, **`/plan`** (Cline Plan/Act: read-only at the gate),
  **`/goal`** lifecycle, **`.`** keep-going, **Ctrl+R** history search.

### Context & memory
- **`/compact` `/shake` `/clear` `/context` `/stats`** operate on the real
  conversation via `transport.getMessages/setMessages/getContextWindow`.
- **Auto-compact** (OpenCode): elide the middle at 80% context (feature-gated).
- **`/memory`**: shared multi-agent, multi-instance project memory
  (`.openkai/memory/`), surfaced on boot; **`/init`** generates AGENTS.md.

### Tools (6 → 12+)
- `glob`, `web_fetch`, `todo`, **`hashline_edit`** (line-anchored structured
  edits with content-hash staleness validation), **`task`** (read-only
  subagent), **`lsp`** (symbol-aware code intelligence), **MCP** proxy
  (`~/.openkai/mcp.json`, JSON-RPC over stdio).

### Hub & connectors
- **`openkai serve`**: loopback-only HTTP hub (refuses non-loopback hosts and
  starts only with `OPENKAI_HUB_TOKEN`); `POST /prompt`, `/sessions` and
  `/memory` bearer-gated; only `/health` is token-free. **`openkai bridge`**:
  pipe-line chat connector relaying into the hub.

### Security posture (E012 adversarial pass — ren@openkai)
- Full deep review (six parallel slices, every finding source-verified) followed
  by a same-release fix programme. Headline closures:
  - **`hashline_edit` is now gated**: approval round-trip, deny floor, canonical
    containment (sibling-prefix + symlink escapes closed), shadow snapshot —
    same posture as `write_file`/`edit_file`. Previously it wrote ungated.
  - **MCP tools merge, never replace** the built-in set, execute **through the
    permission gate**, and spawn with a **secret-scrubbed environment**
    (`procenv.ts`; `mcp test` probes with a minimal env).
  - **Upgrade trust root hardened**: project `.env` can no longer set
    `OPENKAI_*`/`CORTEX_*` knobs (credential-names-only allowlist), release-key
    pinning seam (`OPENKAI_RELEASE_KEY` build define, fail-closed when pinned),
    loud warning when unsigned; `install.sh` now performs the sha256 check its
    header always claimed.
  - **Hub**: bearer required on `/sessions` + `/memory`, Host-header allowlist,
    timing-safe token compare, IPv6 bind fixed, 1 MiB body cap; `bridge --port`
    validated (userinfo-injection token leak closed).
  - **Plan mode enforced at the gate** (in-flight turns included), single
    source of truth on the transport; abort/close settle pending approvals
    (`rejectAll`) and kill gated `bash` children; control events can no longer
    be dropped by the bounded event queue.
  - **Session resume** rehydrates header/seq/parent chain (no more duplicate
    headers); corrupt JSONL tails tolerated; per-session advisory locks.
  - **Fusion**: gate timeouts no longer masquerade as exit 127 (spurious
    repairs), repaired gates re-pass operator consent, telemetry redacts before
    persist/export, corrupt log lines can't zero bandit history.
  - **Shadow git** strips ambient `GIT_*` (a poisoned `GIT_INDEX_FILE` no longer
    touches the real index) and snapshots gitignored files (`add -A -f`).
  - **TUI**: every model/tool render path sanitised (status chip, notices,
    previews, attention notifications), `submit()` busy guard, Ctrl+K palette
    key bound, error turns render.
  - **Auth**: OAuth credentials persist to `~/.openkai/auth.json` (0600) via a
    shared file-backed `CredentialStore` — `login` survives restarts.
- Regression coverage: `test/security-repro-e012.test.ts` pins the fixed
  contracts. 238/238 green.

### Packaging
- npm: `@kaidera/openkai@0.1.5` + `@kaidera/openkai-core@0.1.5` (dist-tag
  `latest`), release tag `v0.1.005`. Standalone binaries rebuilt.

## [0.1.4] — Inc 09 parity pack (TUI liveness + activity feed)

Publishes the unpublished Inc 09 delta that main carried under the stale 0.1.3
version string, and re-syncs all three channels (npm, standalone binaries,
Homebrew tap) so the UAT plan is executable end-to-end. The CLI and core are
bumped to 0.1.4 **in lockstep** (the CLI pins `@kaidera/openkai-core@0.1.4`) so
an install resolves the matching core at publish time — the exact skew that made
0.1.1 and 0.1.3 invisible is closed.

### TUI / Inc 09
- **Slash autocomplete** on `/`, a provider→model picker (`/model`), effort cycle (`/effort`), and fast mode (`/fast`).
- **TUI liveness + activity feed**: animated busy chip (braille frame + current action + elapsed seconds, awaiting/attention priority preserved), provider chip in the chrome, an `onActivity` sink in the transport, a `.openkai/activity.jsonl` feed, and the `openkai tail [-f]` command to watch the machine think from a second terminal.
- **`openkai update`** alias for upgrade: Homebrew-managed installs refuse self-upgrade (Homebrew owns the Cellar) with `brew upgrade` guidance; npm guidance uses the scoped name.

### Packaging
- npm: `@kaidera/openkai@0.1.4` + `@kaidera/openkai-core@0.1.4` (dist-tag `latest`).
- Standalone binaries rebuilt from the certified main tip and attached to `v0.01.004` (darwin-arm64/x64, linux-arm64/x64).
- Homebrew tap `Formula/openkai.rb` repointed to `v0.01.004` with recomputed sha256 values.

### Security baseline
- Security-critical sources (`packages/core/src/fusion/{fuse,gate,synthesis}.ts`) are logic-identical to the E001-certified line (only trailing-newline whitespace differs); `scripts/security-audit.sh` PASSED; 110/110 green.

### Known gaps
- F10 (LOW): `list_files` on a `.ssh` *directory* node still lists filenames (contents remain denied).

## [0.1.3] — TUI stability fix

- Fixes the TUI exit-after-first-turn regression (the session stream no longer closes on `agent_end`; chat exits explicitly on `session_end`; drain helpers break on `session_end`).
- Bare-launch flags: `openkai --provider X` launches the TUI directly.

## [0.1.2] — security patch

**0.1.1 shipped without the certified E001 security fixes and should not be used.** The fix-line was certified on a branch that had diverged from the release line, so the published tarballs were built without it. Upgrade with `npm install -g @kaidera/openkai@0.1.2`.

### Security
- **F4 (HIGH) — deny-floor escape.** A protected name used as a *directory* component (`.env/production`, `server.pem/privkey`) bypassed the permission deny floor and was allowed. `matchesDenyFloor` now tests every ancestor prefix of the path, not just the final segment.
- **F7 / F7b (HIGH) — secret leakage in persistence.** Sessions stored provider keys and secret-shaped values verbatim in world-readable files, and the Cortex `/sessions/ingest` leg was unredacted. Redaction now happens at the write seam and the wire seam via the shared `secrets` module (by NAME and by secret-shaped VALUE), and session files are created `0700`/`0600`.
- **F6b / F6c (HIGH) — spoofable consent surface.** The permission overlay and transcript tool cards rendered model-supplied terminal escapes (OSC 52 clipboard writes, CSI screen clears) verbatim, letting a model forge or erase the approval prompt. Every model-influenced field — tool name, command, diff path, diff body, rule/reason, and tool arg **keys** as well as values — is sanitised and newline-flattened at the render boundary.
- **F5 / F5b (MED) — content/existence oracle.** `edit_file` read its target before the permission gate ran, leaking the content and existence of floor-protected and out-of-cwd files. `guardPath` now precedes any read.
- **F9 (MED) — fusion gate fail-open.** A designed gate with no consent channel executed model-authored shell with the parent environment inherited. Absent consent is now a refusal, and approved checks run with a scrubbed child environment.

Each fix ships with an executable reproducer; the suite is 110/110 green, and reverting the fix sources and rebuilding fails exactly the nine security reproducers.

### Known gaps
- F10 (LOW): `list_files` on a `.ssh` *directory* node still lists filenames (contents remain denied).
- The standalone binary channel (`scripts/install.sh`, Homebrew tap) still points at the `v0.01.001` release assets, which were built from the vulnerable line. Use the npm channel until those assets are rebuilt.

## [0.1.1] — v0.01.001 (first public release)

### Harness
- Single-lane agent loop on `pi-agent-core` (0.84.2 pinned) with pi-ai's 30+ provider substrate; `openkai chat` print mode and `openkai`/`openkai tui` alt-screen TUI share one `SessionTransport` (field-addressed deltas, `openkai.session.v1`).
- Providers: `--provider` across chat/tui/fuse — OpenRouter aggregator plus direct anthropic, openai, google, deepseek, kimi-coding, moonshotai, qwen-token-plan, xai, mistral, groq, cerebras, together, fireworks, nvidia, minimax, zai, vercel-ai-gateway; OAuth subscription lanes for openai-codex and github-copilot. `.env` autoload with env-wins semantics.
- Session persistence: pi JSONL v3 branchable session trees under `.openkai/sessions/`; idempotent Cortex checkpoints (`/sessions/ingest`) and lifecycle events when KOS-managed; standalone-local mode needs nothing.

### TUI
- pi-tui shell: transcript (markdown), composer, status chrome (mode/model/session/tokens/persist mode), slash commands, command palette with fuzzy filter, prompt stash + frecency history, `/btw` side channel, `/undo`, focus-aware attention notifications, per-agent identity pills.
- Permission engine (protocol v2 approval channel): allow/ask/deny, last-match-wins rules, terminal deny floor, inline diff previews, once/always/reject; gated `write_file`/`edit_file`/`bash`. Remote approval injection refused by construction (respond() is in-process only).
- Shadow-git undo: full-tree snapshots before every approved mutation; `openkai undo` restores.
- Droid design discipline: theme-token-only colours, one interaction grammar, clean-by-default density, brand splash exactly once.

### Fusion
- `openkai fuse`: FU-1 role-split panel (architect + builder, separate fresh sessions, parallel), FU-2 attributed synthesis (unattributed merges hard-error), FU-3 gate-first validation (validator-designed executable checks, baseline-must-fail-RED, verbatim feedback, repair-once, loud halt).
- `openkai fusion report|advise`: FU-5 per-pair telemetry rollups; FU-4 deterministic invocation policy (no model calls on the dispatch path); Beta-bandit routing with per-complexity posteriors.

### Security
- E001 gate: per-increment `scripts/security-audit.sh` + white-box review protocol. Canonical realpath containment (symlink-escape fix), case-insensitive + NFC-normalised deny floor, floor enforcement at the tool layer for read-only tools, recursive-grep re-guarding.

### Packaging
- MIT licence; npm packages `@openkai/core` + `@openkai/cli`; standalone per-platform binaries via `bun build --compile`; dual-channel auto-upgrade with rollback and kill-switch; `openkai info` self-check.
