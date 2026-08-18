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

1. `main` green: `npm test` full suite + `scripts/security-audit.sh` PASSED.
2. CHANGELOG entry for the version exists.
3. Version strings bumped in lockstep: root `package.json`,
   `packages/core/package.json`, `packages/cli/package.json` (incl. the core
   pin), `packages/cli/src/version.ts`.
4. `npm publish -w @kaidera/openkai-core` then `-w @kaidera/openkai` (core first;
   the CLI pins the core version).
5. Build all four platform binaries + sha256 sidecars.
6. `gh release create v0.1.<NNN>` with binaries + `latest.json` manifest
   (manifest `version` must equal the npm version). Verify the manifest serves:
   `curl -sL .../releases/latest/download/latest.json`.
7. Repoint `scripts/install.sh` default + Homebrew formula (tap repo) to the new
   tag with recomputed sha256; push both.
8. Verify the update path end-to-end: a fresh install of the previous version
   must reach the new one via `openkai update`.
9. Report the published versions + tag + channel state to the CTO.

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
