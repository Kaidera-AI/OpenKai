# OpenKai development process — the SDLC loop, run by the team

**Status:** BINDING for every openkai agent (kai, ren, quill, beat, cole, bob) and every
session, from 2026-09-03 (CTO standing order; handoff `84edc569`). **Method:** the
`kaidera-sdlc` skill (bound to every openkai role at boot; the `sdlc-loop` rule carries the
six always-on lines). This document does not repeat the skill — it says where each stage
lands in OpenKai, who owns it, and how it meets the PM process. **Owner of this text:**
quill (documentation truth); changes go through the loop like any other change.

```
 INTENT ──> GRILL ──> SPEC ──> PLAN ──> BUILD <──> VERIFY ──> REVIEW ──> SHIP ──> MAINTAIN
   ^                                                                                 |
   └──────────────── incidents, findings and scans re-enter as intent ───────────────┘
```

## 1 · Two repos, one programme

| Repo | Holds | Loop artifacts that live here |
|---|---|---|
| `~/DevVault/OpenKai` (`Kaidera-AI/OpenKai`, programme of record, branch `maintenance/0.84-line` for ledgers; `main` is the public product tree) | `Program/`, `docs/`, `research/`, `CHANGELOG.md` | intent, spec, plan, review dispositions, gate evidence, ship record, SOPs |
| `~/DevVault/openkai-fork` (`Kaidera-AI/openkai-fork`, the source) | the harness: upstream + `packages/coding-agent/src/openkai/` | code, tests, the fork's own docs, `FORK.md` touch-list |

Every epic is a folder `Program/Release_v0.1.NNN/E0NN_<NAME>/` with:

| Stage | File | Template (from the skill) |
|---|---|---|
| Intent | `intent/<slug>.md` (small work: the handoff summary, still answering the five headings) | `templates/intent.md` |
| Grill record | inside the intent (mode, score, decisions) | `references/grill.md` |
| Spec | `EPIC_SPEC.md` (cross-cutting design: `*_DESIGN.md` or `research/*-ADR.md`) | `templates/spec.md` |
| Plan | `PLAN.md` — files that change, order, **waves**, risks, proof, dated amendments | `templates/plan.md` |
| Verify | `INC_NN_GATE.md` — the commands and their literal output on the final tree | stage 4 |
| Review | `DISPOSITION_<REVIEWER>_<INC>.md` — passes, verdicts with evidence, nits capped | `templates/REVIEW.md` |
| Ship | `SHIP_RECORD.md` + `docs/RELEASE_SOP.md` (the gate) | `references/governance.md` |
| Maintain | incident → new `intent/`, an eval (test) and, on the second occurrence, a dated rule in `.agents/rules/` | `templates/bands.yaml`, `references/metrics.md` |

## 2 · Roles

| Agent | In the loop | Not their call |
|---|---|---|
| **kai** (lead) | writes intent and spec with the originator, grills, writes and accepts plans, dispatches waves, adjudicates review findings against the reviewed tip, folds, prepares the release up to the gate | approving own work; passing the gate |
| **ren** (cpo) | grill partner and research; **adversarial review** of every wave (bugs / security / compliance passes, verdicts with evidence); spec review | merging what they reviewed |
| **beat** (pm) | the PM beat: turns the accepted plan's waves into Cortex increments and handoffs, sweeps stale/ageing rows, keeps `PROGRESS.md` honest | changing scope or accepting plans |
| **cole** (orchestrator) | multi-agent waves: worktree per agent, one concern per commit, collects returns | review or release |
| **bob** (full-stack developer) | implements an accepted plan inside the feedback loop; pastes verification | self-approval |
| **quill** (knowledge keeper) | canonical docs, research index, changelog voice; this document | code, PRs, tags |
| **CTO** | policy, plan acceptance for anything that changes a ruling, incident triage, taste, **the go** | — |

The author never approves. The reviewer never merges. The merger never authorises the release.

## 3 · The PM process on the loop

1. **Intent in, intent committed.** Any door (CTO message, handoff, incident, scan) → kai grills quick-mode and commits `intent/<slug>.md` (or answers the five headings in the handoff). Beat routes it to spec.
2. **Spec accepted ⇒ plan mode.** Nothing else starts a plan.
3. **Plan accepted ⇒ waves.** `PLAN.md` §Waves is the PM's source: each wave = one Cortex increment = one handoff to one agent in one worktree (`docs/WORKTREE_SOP.md`). Beat mints or updates the rows; the handoff carries the stage in its summary (`[PLAN]`, `[BUILD]`, `[VERIFY]`, `[REVIEW]`, `[SHIP]`), `--files` names the artifact, `--verify` names the proof, `--branch` names the worktree.
4. **Claim before edit.** A 409 on claim is a live-sibling alarm, not a retry.
5. **Return = pasted output.** No return without the proof commands and their literal output on the final tree; returns carry `--artifacts` (commits, files) and `--followups`.
6. **Review is a wave.** Every build wave gets a review row to ren; findings come back as a disposition file; kai adjudicates against the reviewed tip; re-pins and regenerated artifacts are ratified explicitly.
7. **Beat's sweep** (the launchd PM beat) reports pending / stale / ageing per stage, and moves `PROGRESS.md` — one line per wave, evidence-linked, never adjectives.
8. **Ship is a gate, not a wave.** `docs/RELEASE_SOP.md`: the CTO's per-version, per-session consent. The agent prepares (fold, review verdicts, adjudication, real-engine proof on a fresh host, manifest, changelog) and stops.
9. **Maintain closes the loop.** Incidents (like the 2026-09-03 Cortex data loss, handoff `129cc50e`) become an intent, an eval and — on the second occurrence — a dated rule. Retros feed `research/` and the rules file.

## 4 · Definition of done (paste it, do not describe it)

The plan the wave followed with its amendments · the verification commands and literal output on the final tree · the review verdicts and each finding's disposition · the gate the change waits at (review / adjudication / CTO go) or the merge hash · the rule, eval or pointer line that stops the mistake recurring.

## 5 · Cadence and the rule of one

- One canonical doc per topic; append, never sibling. One state owner per fact. One concern per commit. One question per grill turn.
- The compiled test binary on the Mac is `openkai-next-fork` (built from the wave's branch); a warm host proves nothing about the appliance — the fresh-host drive is the gate.
- `/sdlc <stage> <topic>` and `/grill` in OpenKai itself hand the agent the same references; they are the harness projection of this process, not a substitute for the artifacts.

## 6 · Where the rest lives

`docs/RELEASE_SOP.md` (ship gate) · `docs/WORKTREE_SOP.md` (worktree per agent) · `docs/FORK-SOP.md` (upstream boundary) · `Program/PROGRESS.md` (the ledger) · `Program/FEATURE_REGISTRY.md` (the pre-publish checklist) · `.agents/rules/openkai.md` (the always-on rules) · the skill: `skill://kaidera-sdlc` in any session.
