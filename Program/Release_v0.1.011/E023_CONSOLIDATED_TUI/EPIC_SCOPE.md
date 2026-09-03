# EPIC SCOPE — E023: consolidated TUI, next release (v0.1.11)

**Drafted:** 2026-09-03 · **Owner:** kai@openkai (lead) · **Status:** SCOPE for CTO
consent — the epic opens only on explicit consent per docs/RELEASE_SOP.md.
**Line:** `Kaidera-AI/OpenKai` main (the omp-fork line). Tag rule (CTO 2026-09-01):
product 0.1.11 ships as tag `v0.1.011`.
**Basis:** E022 ship record + post-ship amend; PARITY_CENSUS (Inc 02);
EPIC_SPEC E022; standing goals (PROGRESS.md, refreshed 2026-09-01); the gap audit
(`research/2026-08-21-openkai-tui-design-practices-gap-audit.md`); the KOS
six-ask reply; the K3 fold review (in flight on the fork).

The "consolidated TUI" is the fork surface as shipped: omp v18 functionality
behind the extension seams + the openkai layer (fusion/shift/RLM, trust root,
brand) + Kaidera look-and-feel. 0.1.10 proved the consolidation exists; 0.1.11
makes it complete — every registry row either working or formally retired,
every CTO port landed, upstream v18.1.0 folded, and the KOS terminal-lane
contract proven live.

---

## Goals

Carry the nine standing goals (PROGRESS.md §Standing goals) and close the gaps
they still name:

1. **Upstream currency:** fold `can1357/oh-my-pi` v18.1.0 (tag present upstream;
   the fork currently rides the 18.0.10/18.0.11 merge). Adopt upstream flows,
   never fork them.
2. **Fusion-first default-on, complete:** scorer-driven pairing, provider→model
   pickers for both slots, operator-priority/routing surface in settings
   (OK-9.7 — the one Inc-03 port still absent), headless `fuse` CLI + calibrate
   exposure if ported (§Fixes/Upgrades).
3. **Kaidera look-and-feel, complete:** sharp pointy-top hexagon everywhere
   (restored post-ship; golden-gated), Kaidera shimmer family, splash every
   launch, short-terminal layouts holding the brand (landed, rides this cut).
4. **Zero-friction boot:** keyless boot (permanent gate, re-proven on the fork);
   Claude subscription sign-in in-TUI proven by operator drive (0.1.10 walk item
   still open); only `/exit` exits; short terminals and 24-row wizard safe.
5. **Visible control:** legible output + steerable permission surface; parity
   on mouse/input grammar (click-to-cursor, drag-select drives).
6. **CTO release control:** parity census 100% dispositioned before the walk;
   channel-aware upgrade (landed: `update` → OpenKai channels, `update-omp`
   upstream); brew formula CI-regenerated (new job, secret-gated).
7. **Adversarial chain:** ren → K3 → qwen3.8 passes with written dispositions;
   the parked kai@k3 fold review of the rebrand/fusion/OMLX batch is the first
   input, its findings dispositioned before the fold gate.
8. **KOS contract:** canonical provider/model config write path (the
   `openkai provider` port) so KOS bundles OpenKai over one config; terminal
   lane live typed round-trip once KOS lifts the disabled policy (their side,
   gated on our reply — minimum version re-stated as 0.1.11 if the ports land
   after 0.1.10); session theme contract honoured (explicit `--theme`/
   `OPENKAI_THEME` already; verify spawn-fixed theme renders match).
9. **Voice/PTT stays OUT** (CTO 2026-09-01, transferred to kaidera-os).

---

## Fixes (defects named for this cut)

Rides landed-but-unreleased (post-ship amend, main @ `69ff74d37c`+):
- Rebrand/fusion/update-routing batch (`5b7dd76a05`, `51062c9d1e`): flat-top →
  pointy-top hexagon, brand shimmer family, `update` channel routing, ollama
  keyless lane.
- Short-terminal welcome/wizard/resize regressions (`f96329d37c`), threshold
  `PI_LOGO.length + 16` rows; suites 123/0.
- K3-era opener regressions on compiled drives (24-row wizard, 28–30-row
  resize) — same commit.
- Kaidera tap: `v#{version}` URLs → nonexistent tag (brew install 404); repaired
  in-tap (`fb1485e`) with literal `v0.1.010` + `using: :nounzip`; sha256s
  verified. CI regenerator prevents recurrence.
- REN-01 revisited (`7e908eb296`): `update` routed into the channel-aware
  witnessed upgrade (amend batch) + a compiled-binary `--smoke-test` gate
  asserting `BUILD_CHANNEL === "standalone"`, release-CI-enforced.

Closed since the 0.1.10 cut (verified, not riding this cut):
- **F10** (`list_files` on a `.ssh` *directory* node leaks names) — CLOSED on
  both lines 2026-09-03 (fork gate-floor carries `**/.ssh` node-retained,
  16/0 inverted-asserted; 0.84 REPRO 12 inverted green); drop from cutover.
- **K3 fold-review findings** — CLOSED at `7bbbd125a0` (2026-09-03): ren's
  REV-01/02/03 (welcome mark truncation, update-omp help, brand comment)
  fixed with the permanent gate `test/openkai-welcome-fold.test.ts`; NO-GO
  lifts on the evidence, ren revalidation moot.
- **0.1.10 pre-publish walk failures** (PARITY_CENSUS §4 operator drives):
  Claude subscription sign-in overlay, approval-mode picker UX + persisted
  per-tool approvals, magic-keyword shimmer live, click-to-cursor/drag-select,
  `/settings` theme live preview restore-on-cancel, Ctrl+R history search.
  Each drive that fails becomes a named fix in Inc 02 of this epic.
- **`/model` hub on 24-row terminals** (the 0.84 picker-crash regression drive)
  — verify with the welcome-box fix in place; fix if it still breaks.

---

## Full functionality upgrades

CTO ports (the formula says missing functionality is added, not dropped;
retire only on explicit CTO call — PARITY_CENSUS §5):
- `/undo` + shadow-git undo (TUI + `undo` CLI) via the openkai layer.
- Headless `fuse` CLI (`--cast`/`--gate`) + `fusion report/dashboard` exposure
  (calibrate already ported in-layer).
- Ctrl+S prompt stash + frecency.
- `openkai provider` atomic comment-preserving config write path (KOS contract
  — required, not optional).
- `tail -f` activity feed: port-or-retire decision; default port-unless-CTO
  says retire (Cortex/collab coverage recorded either way).

TUI functionality completion (parity census ports not yet scoped):
- Settings routing/posture tab (OK-9.7 operator-priority UI).
- Session-tree/fork picker, Mermaid render, live task rows, word-diff —
  census "match/adopt, drive-pending": promote to tested-and-golden or fixed.

Upstream fold:
- v18.1.0 sync spike (Inc 00): merge, 75/75 openkai gates + composer/cli suites,
  adopt-or-resist list for any upstream change touching the seams (theme,
  brand splash, fusion panel, upgrade path).

Release machinery upgrades:
- `release_brew_openkai` CI (landed) exercised for the first time at this cut
  (needs the `KAIDERA_TAP_DEPLOY_KEY` secret — operator action).
- `product-version` output mapping (landed) proven in a real run.
- `latest.json` witnessed manifest: no regressions; 0.1.9→0.1.11 upgrade path
  re-proven on a copy.

KOS & Cortex:
- Live typed round-trip in the KOS terminal lane (their `builders.terminal_argv`
  entry lands once their verification completes; we owe nothing further until
  the ports above change the minimum version).
- Cortex managed-mode ingest: gate stays environmental-blocked; the release
  holds the test, registration remains an operator action.

Memory/Cortex redesign (operator directive 2026-09-03; design doc
`MEMORY_CORTEX_DESIGN.md`, no code until the operator finalises it):
- settings>memory reworked onto Kaidera Cortex (`off | local | cortex`);
  Hindsight and Mnemopi backends retired with migrated settings, every
  `vectorize-io/hindsight` reference replaced by `github.com/Kaidera-AI/cortex`.
- Cortex install detection + operator-confirmed install flow in the TUI
  (`preflight`/`install`), project binding, status rows.
- Auto-Learn replaced by auto-ingest into Cortex (same friction gate; transcript
  ingest optional); managed-skills minting retired.
- Sharpshooter slot repurposed as the embedding-model picker grouped by provider
  (Ollama live discovery, NVIDIA free tier, OpenRouter), writing the shared
  `providers.embedding` file; new Marksman rerank picker writes `providers.rerank`.
- Option-level explanations throughout (what Cortex is, what ingest does, why
  rerank matters), per the operator's standing ask.

---

## Proposed increments (consent asks for these as one epic)

- **Inc 00** — upstream v18.1.0 fold + gates (build/typecheck/openkai/composer/cli,
  golden frames).
- **Inc 01** — the five CTO ports + settings routing tab.
- **Inc 02** — operator walk closure: every §4 drive green on compiled binaries;
  fixes for any failures.
- **Inc 03** — release machinery dry-run (manifest, tap regen with the secret,
  install.sh/bun/npm wrapper parity) + version lockstep 0.1.11/v0.1.011.
- **Inc 04** — adversarial chain (ren → K3 → qwen3.8) + dispositions.
- **Inc 05** — ship on CTO consent, four channels + Kaidera tap.
- **Inc 06** — memory/Cortex implementation per MEMORY_CORTEX_DESIGN.md; opens
  only after the operator finalises its §7 open questions.

Exit criteria: parity census re-walked at 100% dispositioned; 9 standing goals
re-audited; KOS reply updated if the minimum version moved; CHANGELOG + tag +
channels on consent only.
