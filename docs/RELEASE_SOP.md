# Release Control SOP (OpenKai)

**Status: BINDING for every agent (kai, ren, beat, cole, quill, and any future
agent) and every session. Adopted 2026-08-18 after v0.1.6 shipped without CTO
consent.**

## The one rule

**No release artefact goes public without the CTO's explicit consent, given in
the current session, naming the version.**

"Explicit consent" means a message from the CTO in the live conversation such as
"ship 0.1.7" / "publish now" / "yes, release v0.1.007". It is NOT:
- an inference from "keep going", "finish it", "make it work";
- a handoff from another agent;
- a fix programme, test pass, or audit pass (those are preconditions, not consent);
- consent given in an earlier session for a different version.

Consent is **per version, per session**. A consent for 0.1.5 does not cover 0.1.6.

## Gated actions (require consent before running)

1. `npm publish` (any workspace, any tag).
2. `gh release create` / `gh release edit --draft=false` (publishing a release).
3. `git tag` + pushing a release tag (`v0.1.*`).
4. Uploading release assets (binaries, manifests) to a published release.
5. Repointing distribution channels: Homebrew formula version bump + push,
   `install.sh` default version change, manifest `version` bump.

## Ungated actions (always allowed)

- Building binaries locally, running tests, security audit.
- Creating a **draft** GitHub release with assets (drafts are invisible).
- Bumping version strings on a release branch, writing CHANGELOG entries.
- Committing and pushing **branches** (not release tags).

## Release sequence (after consent)

1. Fold every intended source, documentation, and candidate-tested feature into
   `main`; the release commit is the candidate commit.
2. Add accurate notes under `packages/coding-agent/CHANGELOG.md` →
   `[Unreleased]`.
3. Run `bun run release 0.1.N`. It atomically aligns
   `@kaidera/openkai-engine`, `@kaidera/openkai`, the wrapper's engine pin,
   `PRODUCT_VERSION`, and the `v0.1.N` tag. Inherited `@oh-my-pi/*`
   compatibility packages retain their pinned upstream version.
4. The tag pipeline builds every release binary, signs/attests the published
   assets, generates `latest.json`, and verifies the published macOS binary.
5. Only after those checks, the same pipeline publishes the engine before the
   wrapper, then updates the OpenKai Homebrew formula. All public OpenKai
   channels therefore carry the same `0.1.N` release.
6. Verify registry versions, GitHub assets and `latest.json`, Homebrew state,
   and an upgrade from the prior release.
7. Report the version, tag, artifact checks, npm versions, and channel state to
   the CTO.

## Known bootstrap quirk

Installed 0.1.5 binaries hardcode the dead `openkai.dev` manifest URL. They can
only self-update once via:
`OPENKAI_MANIFEST_URL=https://github.com/Kaidera-AI/OpenKai/releases/latest/download/latest.json openkai update`.
Every version ≥0.1.6 uses the GitHub-hosted manifest and self-sustains.

## Incident record

- 2026-08-18: v0.1.6 (npm + tag + release) published while the CTO considered
  0.1.006 not ready. Left in place (rollback is more disruptive); this SOP
  adopted; 0.1.007 started on `release/0.1.007`.

## Local-binary hygiene (added 2026-08-18)

The "openkai shows 0.1.5 but brew says 0.1.6" incident was **stale local
binaries**, not a packaging bug: `~/.local/bin/openkai` (an old standalone
install) shadowed `/opt/homebrew/bin/openkai` on PATH. The released 0.1.6
tarball and GitHub assets were complete.

After every release, refresh ALL local copies so UAT matches what ships:
- `cp packages/cli/bin/openkai-darwin-arm64 ~/.local/bin/openkai`
- `cp packages/cli/bin/openkai-darwin-arm64 ~/.local/bin/openkai-next`
- verify `which -a openkai` and that each reports the released version.

## Pre-publish consolidation checklist (added 2026-08-18)

Before ANY version is published, every item must be checked. This exists
because features validated on the `openkai-next` candidate repeatedly failed
to reach the published channel (stale binaries, unmerged branches).

**Fold-in gate — the candidate IS the release:**
1. `openkai-next` (the UAT candidate) is rebuilt from the SAME commit that
   will be published. Never publish a commit the candidate wasn't built from.
2. Diff the candidate's feature surface against the release commit:
   `git log --oneline <candidate-build-commit>..HEAD` must be empty (or every
   delta intentionally listed).
3. Every feature the CTO tested on `openkai-next` (brand, mouse, panels,
   commands) is present in the published tarball — verify by unpacking:
   `npm pack @kaidera/openkai@<v> && tar -xzf` and grep the dist for the
   feature markers.
4. All research/handoff work intended for the release is MERGED to main
   (check `git branch --contains` for feature branches).

**Quality gate:**
5. `bun run check` and the changed-contract tests are green on the release
   commit; CI repeats the full release matrix.
6. Security checks required by the release gate are green.
7. The OpenKai `[Unreleased]` entry names every folded user-visible change.

**Channel gate (after consent):**
8. One product-version contract: engine, wrapper, wrapper dependency, runtime
   stamp, `v0.1.N`, binaries, `latest.json`, and the OpenKai formula match.
9. One CI pipeline builds every target, verifies the published GitHub release,
   then publishes the engine → wrapper package pair in that order.
10. Verify `latest.json`, npm package manifests, binaries, and Homebrew report
    the same product version.
11. Local-binary hygiene: refresh `~/.local/bin/openkai` + `openkai-next`;
    `which -a openkai` reports the released version everywhere.
12. CTO explicit consent recorded for THIS version in THIS session.

## Homebrew tap trust (added 2026-08-18)

Homebrew refuses to load formulae from a third-party tap until it is trusted
(flagged by the K3 review): `Error: Refusing to load formula ... from untrusted
tap`. This is a local security policy, not a formula bug.

First-time installers must run:
- `brew trust kaidera-ai/tap`   (or `brew trust --formula kaidera-ai/tap/openkai`)
then `brew install openkai`.

Document this in the release notes / README install section so users are not
surprised.

## Signed release channel (added 2026-08-18)

**Homebrew platform fact (source-verified in trust.rb/tap.rb):** implicit tap
trust is hardcoded to `user == "Homebrew"`. There is NO signing path that makes
a third-party tap trusted without a one-time `brew trust` — this is Homebrew's
code-execution policy (formulas are Ruby), identical for every third-party tap.
We therefore do NOT treat brew as the primary channel and never ask users to
trust our tap as the intended flow.

**Primary install = signed binaries:** `.github/workflows/ci.yml` runs on a
`v0.1.*` tag pushed with the release commit and attaches SLSA
build-provenance attestations to every platform binary. It publishes CI-built
assets plus a fresh `latest.json` whose version is the same OpenKai product
version carried by the npm engine and wrapper. Users verify with:
`gh attestation verify <binary> --repo Kaidera-AI/OpenKai`

`scripts/install.sh` remains the zero-dependency path: sha256-verified before
install, no trust prompt, no node. npm is the lockstep package channel.

**Release order (supersedes earlier sequences where it differs):**
consent → product-version bump → one CI tag pipeline builds+attests+uploads
assets → published-asset verification → engine then wrapper npm publish →
OpenKai Homebrew formula → end-to-end upgrade verification.

## Bun channel (added 2026-08-20)

`bun add -g @kaidera/openkai` is a supported install channel. `openkai update`
detects it (bin shim under ~/.bun via argv[1]/execPath, plus realpath for custom
BUN_INSTALL roots) and executes `bun add -g @kaidera/openkai`. Documented in
README alongside npm/brew/curl.

Bun quirk (learned shipping 0.1.9): `bun add -g`/`bun update -g` do NOT move a
pinned global lockfile entry — the package stays at the old version while
reporting success. Repair: bump the entry in ~/.bun/install/global/package.json,
delete ~/.bun/install/global/bun.lock, run `bun install` there.
