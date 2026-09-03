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

1. Prepare the executable source in private `Kaidera-AI/openkai-fork`: the
   engine manifest, `@kaidera/openkai` wrapper, wrapper engine dependency, and
   runtime `PRODUCT_VERSION` MUST have one `0.1.N` version.
2. Run `bun run release <0.1.N>` from that source repository. It validates the
   source commit, tags it, and uploads a SHA-256-recorded source handoff to a
   **draft** release in canonical `Kaidera-AI/OpenKai`.
3. The canonical `OpenKai release` workflow materializes that exact handoff,
   verifies its source SHA and public-version contract, then builds every
   native addon and standalone target.
4. The workflow attaches all binaries, browser relay extension, signed
   `latest.json`, checksums, and SLSA provenance to the still-private draft.
5. It publishes `@kaidera/openkai-engine` before `@kaidera/openkai` through
   npm OIDC trusted publishing.
6. It removes the private handoff assets, publishes the canonical GitHub
   release, then regenerates and pushes the Kaidera Homebrew formula from the
   release asset digests.
7. Verify the released registry versions, `latest.json`, and all canonical
   release assets; then exercise the applicable installed update path.
8. Report the source SHA, package versions, tag, distribution state, and every
   authorized exception to the CTO.

## Known bootstrap quirk

Installed 0.1.5 binaries hardcode the dead `openkai.dev` manifest URL. They can
only self-update once via:
`OPENKAI_MANIFEST_URL=https://github.com/Kaidera-AI/OpenKai/releases/latest/download/latest.json openkai update`.
Every version ≥0.1.6 uses the GitHub-hosted manifest and self-sustains.

## Incident record

- 2026-08-18: v0.1.6 (npm + tag + release) published while the CTO considered
  0.1.006 not ready. Left in place (rollback is more disruptive); this SOP
  adopted; 0.1.007 started on `release/0.1.007`.

- 2026-09-03: v0.1.12 is explicitly authorized with the Windows/PowerShell
  runtime check and the clean-host, Cortex, and enrichment external gates
  waived. The published release notes MUST carry this exception; build,
  version-contract, asset-integrity, and non-waived smoke checks remain
  required.

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
1. `openkai-next` (the UAT candidate) is rebuilt from the same private-source
   SHA carried in the canonical release handoff.
2. Every intended feature is present in the source handoff and in the packed
   `@kaidera/openkai-engine` payload.
3. All intended source work is merged to `openkai-fork/main` before the
   source tag is created.

**Quality gate:**
4. The source release check and the canonical workflow's version assertion,
   native build, and applicable binary smoke paths succeed.
5. CHANGELOG entry for the version exists and lists every folded increment.
6. A gate may be waived only by explicit, version-scoped consent in the live
   session; the canonical release notes MUST state the exception.

**Channel gate (after consent):**
7. Engine manifest, wrapper manifest, wrapper engine pin, and runtime version
   are lockstep `0.1.N`.
8. The source archive SHA and source revision are verified before canonical
   builds begin; the handoff archive is removed before the draft is public.
9. npm OIDC publishes `@kaidera/openkai-engine` before
   `@kaidera/openkai`; both registry versions equal the release version.
10. GitHub release contains every target binary, relay extension, checksums,
    SLSA provenance, and a signed `latest.json` whose version equals npm.
11. The Kaidera Homebrew formula is generated from those canonical asset
    digests and pushed after the GitHub release is public.
12. CTO explicit consent and every exception are recorded for this version in
    this session.

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

**Primary install = signed binaries:** canonical
`.github/workflows/release.yml` is manually dispatched only after the
consented source handoff is staged on a draft release. It verifies the handoff
SHA, builds the source snapshot, attaches SLSA build-provenance attestations to
every platform binary, and signs `latest.json` with the canonical release key.
The private source handoff is deleted before publication. Users verify with:
`gh attestation verify <binary> --repo Kaidera-AI/OpenKai`

`scripts/install.sh` remains the zero-dependency path: sha256-verified before
install, no trust prompt, no node. npm is the lockstep package channel, using
canonical-repository OIDC with an `NPM_TOKEN` secret fallback only when npm has
no matching trusted publisher, including a package's first release.

**Release order (supersedes the earlier sequence where it differs):**
consent → private source version/tag → SHA-verified canonical draft handoff →
canonical CI builds/signs/stages assets → npm engine→wrapper publish → publish
the GitHub draft → update Kaidera Homebrew tap. Document `brew trust` as a
known Homebrew limitation, not the intended default.
\n
## Bun channel (added 2026-08-20)

`bun add -g @kaidera/openkai` is a supported install channel. `openkai update`
detects it (bin shim under ~/.bun via argv[1]/execPath, plus realpath for custom
BUN_INSTALL roots) and executes `bun add -g @kaidera/openkai`. Documented in
README alongside npm/brew/curl.

Bun quirk (learned shipping 0.1.9): `bun add -g`/`bun update -g` do NOT move a
pinned global lockfile entry — the package stays at the old version while
reporting success. Repair: bump the entry in ~/.bun/install/global/package.json,
delete ~/.bun/install/global/bun.lock, run `bun install` there.
