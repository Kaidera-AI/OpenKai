# EPIC SPEC — E020: 0.1.10 maintenance release (scope closed)

**Epic:** E020_OMP18_FOLDINS → **rescoped to a thin maintenance release**
**Release:** v0.1.10 (0.1.10 — ships ONLY on explicit CTO consent per docs/RELEASE_SOP.md)
**Owner:** kai@openkai (lead) · **lane: ren@openkai (CPO)**
**Opened:** 2026-08-22 · **Rescoped:** 2026-08-22 (CTO fork decision — see
research/2026-08-22-fork-omp-evaluation.md and E021)

---

## 1. Scope (closed — nothing more lands here)

0.1.10 is the last release on the current (pi-0.84) line before the omp-fork
spike (E021). It ships:

- **`/shake thinking`** (OMP v18 fold): strips reasoning blocks from context.
- **The dogfood campaign outputs**: whatever the campaign (docs/DOGFOOD.md)
  surfaces as defects — fixes only, no new surface.
- **Docs**: CAPABILITIES/TEST_GUIDE/DOGFOOD updates already landed; the
  dependency verdict (pi-18 is bun-runtime-only) recorded.

Explicitly OUT (parked by the fork decision): the namespace migration (Option
B of the dependency verdict), bench dashboard, render replay, spellcheck,
hashline sloppy fallback, resizeScrollback — these re-plan against the fork
base in E021/E022 instead of being built twice.

## 2. Exit criteria

1. `npm test` full suite green + security-audit PASSED on the release commit.
2. CHANGELOG [0.1.10] entry listing the above.
3. Version lockstep 0.1.10 everywhere; tag v0.1.010; SOP channel sequence.
4. The dogfood campaign's then-current findings are dispositioned.

## 3. After the cut

The line enters MAINTENANCE: security/crash fixes only, while E021 (the fork
spike) runs on its own branch. No new feature work on this line.
