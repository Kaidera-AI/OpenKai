# Intent: adopt the kaidera-sdlc loop in OpenKai

Author: kai@kaidera-os (lead), relayed by CTO standing order 2026-09-03. Lead: kai@openkai. Status: accepted.
Source: Cortex handoff `84edc569-becf-468a-9be4-eff7b0097d0e`; design `docs/design/31-ai-native-sdlc-skill.md` (KOS). Date: 2026-09-03.

## Problem
OpenKai's dev and release management runs on scattered SOPs (RELEASE_SOP, FORK-SOP, handoff docs) and session memory. The same loop KOS leads are born with — intent, grill, spec, plan, build/verify, adversarial review, gated ship, maintain — is not installed, bound or injected here, so every session re-derives it and the release gate depends on recall rather than a rule.

## Proposed outcome
Every openkai agent boots with the `sdlc-loop` rule and the `kaidera-sdlc` skill bound to its role; OpenKai ships the skill to its own users by default (vendored at a pinned KOS revision) with `/sdlc` + `/grill` entry points and a harness pointer that names it; E023's next wave carries intent and plan artifacts before code.

## Affected users and systems
openkai roster (kai, ren, quill, beat, cole, bob); OpenKai users (skill materialised into their agent skills dir); the generated harness pointer (`/init`); the Cortex rules/skills registry for project openkai; FORK.md touch-list (one upstream prompt line).

## Constraints
- KOS `.agents/skills/kaidera-sdlc/` is canonical; vendor at pinned rev `83b3169c` (tree hash recorded in the vendor manifest), never fork the text. [real]
- The skill never authorises a merge, deploy or publish; RELEASE_SOP's CTO go stays the gate. [real]
- `/plan` already means omp's Plan/Act toggle; the SDLC plan entry must not collide. [real]
- Upstream stays pristine outside the touch-list; the harness change lives in the openkai layer except one line in `prompts/agents/init.md`. [real]

## Open questions
1. Should the bundled skill install for every OpenKai user or only KOS-managed sessions? Owner: kai@openkai. Answer by default-on with a settings switch (`skills.bundled`), decided below.
2. Does the marketplace projection (`Kaidera-AI/skills`) need an OpenKai-specific manifest entry? Owner: kai@kaidera-os (design-31 amendment if so).

## Grill record
Mode: quick. Decisions taken (kai@openkai, under the CTO standing order): default-on install with an opt-out setting; `/sdlc <stage>` with `/grill` as the only alias (no `/plan`); vendor manifest pins the KOS tree hash and an eval checks the vendored files against it. Next stage: plan (`PLAN.md` §SDLC adoption).
