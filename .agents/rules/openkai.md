# GENERATED FROM CORTEX — DO NOT EDIT (source: rules@0406fb115914)

# openkai rules


## The SDLC loop every lead runs (CTO 2026-09-03)

<!-- rule_slug: sdlc-loop -->

Every epic, feature, fix, incident, review and plan runs the Kaidera AI-native SDLC loop (skill `kaidera-sdlc`, design 31, CTO standing order 2026-09-03; adopted for OpenKai dev and release management by handoff 84edc569): INTENT -> GRILL -> SPEC -> PLAN -> BUILD <-> VERIFY -> REVIEW -> SHIP -> MAINTAIN, with incidents and findings re-entering as intent.

The part that always holds:
1. Nothing is implemented without an accepted plan (files that change, order, risks, proof); departing from the plan updates the plan in the same commit.
2. Grill before you build: one question at a time; facts are looked up, decisions are put to the human; stop at shared understanding.
3. Verification is output that can fail, pasted from the final tree; a green suite is not evidence of behaviour; a bug fix starts with a failing test that is never edited to pass.
4. Review separates duties: the author never approves; Ren's adversarial review, kai's adjudication, then merge.
5. The agent acts up to the gate and cannot pass it: merge to main, deploy, publish and release wait for the named human authorisation (the CTO's go, docs/RELEASE_SOP.md).
6. Mistake twice, rule once; incidents become intent and evals; every rule is a dated decision with evidence and a reopening trigger.

The skill carries the depth (references, templates, evals). Load it at the start of any work and cite the stage you are in. OpenKai artifacts live under `Program/<release>/<epic>/` (intent/, EPIC_SPEC.md, PLAN.md, DISPOSITION_*.md); the fork carries the code.
