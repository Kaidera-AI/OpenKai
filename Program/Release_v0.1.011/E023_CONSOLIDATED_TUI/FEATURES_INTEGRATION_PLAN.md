# E023 feature integration plan

**Status:** implemented remediation in source worktree; unreleased pending final validation and external acceptance.

This plan replaces the earlier research inventory where planned features, obsolete command names, and claimed completions were mixed together. It records only the features that have a real OpenKai surface, state owner, and observable contract.

## Product decisions

1. **Normal work uses two-model teamwork.** The main model works; the advisor checks it. Settings, Agent Hub, and `advisor: false` provide deliberate single-model mode.
2. **Explicit hard decisions use `/fusion`.** Fusion is Architect + Builder + fresh Judge. `/fuse`, a headless Fusion CLI, and model-authored gate controls are not public OpenKai commands.
3. **Cortex is shared memory, not implicit telemetry.** Memory is opt-in; transcript ingest is opt-in and off by default; writer identity is roster-checked.
4. **Settings own durable configuration.** Cortex endpoint/project/agent are settings-driven; OpenKai-owned provider and Fusion data share serialized `~/.openkai/config.json` updates.
5. **No new feature tab.** Features land in existing Settings groups, slash-command families, Agent Hub, or the active TUI conversation.

## Implemented integration map

| Feature | Existing surface | State owner | Observable contract |
| --- | --- | --- | --- |
| Cortex memory | Settings → Memory; `/memory stats`; Cortex tools | Cortex settings/client | Backend activation, first-turn recall path, registered-writer write boundary |
| Project installation/registration | `/cortex` | Cortex command extension | Confirmed install; confirmed registration requiring admin token; roster commands |
| Provider selection | Settings → Memory → Cortex Ingest; `/cortex status` | OpenKai config I/O + provider selection | Atomic persisted selection; live/pending/failure outcome visible |
| Two-model teamwork | Settings → Model; Agent Hub; task frontmatter | Advisor setting + task resolver | Default advisor role; intentional `advisor: false`/off escape hatch |
| Fusion | `/fusion`; active transcript | Fusion custom tool | Architect/Builder/Judge verdict with agreements, choices, discarded ideas, checks |
| Agent steering | Agent Hub | Live session/agent registry | Operator can inspect and send one instruction to a selected worker |
| Product identity | CLI, ACP, installers, release assets, docs | OpenKai branding constants/release scripts | Public command/assets/docs say OpenKai/openkai |

## E023 acceptance gates

### Code gates

- `bun --cwd=packages/coding-agent run check`
- Focused Cortex, Fusion, advisor/model-resolution, installer/release-manifest, and brand-facing tests
- Shell/PowerShell syntax checks for changed installers

### Behavioral gates

- Run the interactive public command and verify `/fusion help`, `/cortex help`, and TUI beginner tips.
- Run `/cortex status` with an inactive backend and with a managed environment lane.
- Confirm an unregistered implicit writer fails before a memory payload is sent.
- Confirm an explicit model-team task can choose single-model mode.
- Confirm a Fusion result renders Judge comparison rather than metadata-only role counts.

### External acceptance gates before release

1. Clean-host public installer/binary drive using `openkai` and `openkai-*` assets.
2. Local Cortex install → confirmed registration drive using a valid `CORTEX_ADMIN_TOKEN`.
3. Live enrichment-provider configuration application using the intended provider credential plus admin token.

No release documentation may claim these green until an operator records the observed result.

## Deferred work

The prior plan listed layout drawers, obligation ledgers, plugins, broad runtime-port parity, hosted services, generic model discovery, a headless Fusion CLI, and a large upstream-sync program. Those items are **not implemented by E023** and are not release claims.

A future proposal must state:

1. the existing surface it extends;
2. a single source of truth for its state;
3. its user-visible contract and one focused verification gate;
4. whether it changes privacy, provider credentials, installation, or public branding; and
5. migration/compatibility behavior if it touches existing state.

Reject proposals that create a detached feature tab, duplicate an existing state owner, or depend on undocumented external service behavior.

## Follow-on order

1. Complete the three external acceptance gates.
2. Record the final source/program handoff without committing or publishing from the remediation worktree.
3. Obtain the required review and release approval.
4. Scope future work separately; do not attach it to the E023 release proof.
