# Homebrew tap deploy-key custody

Linked from `docs/RELEASE_SOP.md`. Written after the 2026-09-17 incident: `release_brew`
failed with `Permission denied (publickey)` because `Kaidera-AI/homebrew-tap` had zero
registered deploy keys while `Kaidera-AI/OpenKai`'s `KAIDERA_TAP_DEPLOY_KEY` secret still
pointed at one. Nothing anywhere said what that secret was, how to rotate it, or how to
check it before a release needed it. This page is that procedure.

## 1. The invariant

`KAIDERA_TAP_DEPLOY_KEY` (a repository secret on `Kaidera-AI/OpenKai`, consumed by
`release_brew` in `.github/workflows/release.yml` as `ssh-key: ${{ secrets.KAIDERA_TAP_DEPLOY_KEY }}`
when checking out `Kaidera-AI/homebrew-tap`) and a **read-write deploy key registered on
`Kaidera-AI/homebrew-tap`** are one pair, not two independent facts. Either side can go
stale without the other noticing:

- Rotate the secret on `Kaidera-AI/OpenKai` without adding the matching public half to
  the tap → `release_brew` gets `Permission denied (publickey)` (the 2026-09-17 failure).
- Remove or expire the deploy key on the tap without rotating the OpenKai secret →
  same failure, different cause, identical symptom.
- Add a deploy key to the tap but as **read-only** → `release_brew`'s
  `git push origin HEAD:main` step fails even though `git clone`/checkout succeeds,
  because GitHub enforces read-only at push time, not checkout time.

There is exactly one live pair at a time. A rotation that does not update both halves
in the same sitting is not a rotation, it is an outage waiting for the next release.

## 2. Pre-flight check (run before cutting a release, not discovered mid-release)

```sh
gh api repos/Kaidera-AI/homebrew-tap/keys \
  --jq '[.[] | select(.read_only == false)] | length'
```

- `0` → no write-capable deploy key exists. `release_brew` **will** fail. Rotate (section 3)
  before dispatching `release.yml`.
- `>= 1` → at least one write-capable key is registered. This does not by itself prove
  the *secret* matches one of them (GitHub never returns private-key material to check
  that), only that a healthy target exists. If `release_brew` still fails after this
  check passes, the secret itself is stale relative to every registered key — rotate
  both together (section 3), do not add a second key hoping one matches.

Verified live against the current tap on 2026-09-19 (this handoff's receipt): the check
returns `1` (`openkai-release-ci-tap-write-20260917`, `read_only: false`) — the pair
rotated during the 2026-09-17 incident is still the live one.

Run this as the first step of any release runbook, or on a schedule (weekly is enough;
the failure mode is "someone rotated one half and forgot the other," not silent decay of
an untouched key) — either is acceptable; this page does not mandate which, that is an
operator/CI-scheduling choice outside this wave's scope.

## 3. Rotation procedure (as performed 2026-09-17, and again to write this page)

0. **Make a private scratch directory** -- never a fixed, predictable path:
   ```sh
   key_dir="$(mktemp -d)"
   ```
1. **Generate a fresh keypair**, ed25519, no passphrase (the CI job cannot prompt for one):
   ```sh
   ssh-keygen -t ed25519 -f "$key_dir/tap-deploy-key" -N "" -C "openkai-release-ci-tap-write-$(date +%Y%m%d)"
   ```
2. **Register the public half on the tap, with write access**:
   ```sh
   gh repo deploy-key add "$key_dir/tap-deploy-key.pub" \
     --repo Kaidera-AI/homebrew-tap \
     --title "openkai-release-ci-tap-write-$(date +%Y%m%d)" \
     --allow-write
   ```
   `--allow-write` is not optional — an omitted or default (read-only) key passes the
   pre-flight `select(.read_only == false)` filter as absent and `release_brew`'s push
   step fails exactly as it did on 2026-09-17.
3. **Remove the stale key** on the tap (if one is being replaced, not added fresh) so
   `gh api .../keys` never reports more than one live write key at a time — a second,
   forgotten key is itself a future incident (which one does the secret actually match?):
   ```sh
   gh api -X DELETE repos/Kaidera-AI/homebrew-tap/keys/<old-key-id>
   ```
4. **Set the matching secret on OpenKai** in the same sitting, from the private half:
   ```sh
   gh secret set KAIDERA_TAP_DEPLOY_KEY --repo Kaidera-AI/OpenKai < "$key_dir/tap-deploy-key"
   ```
5. **Remove the local private key and its directory.** Rotation, not deletion
   mechanics, is the real control here (independent review, T2-5): a `shred`/`rm -P`
   pass gives no overwrite guarantee on a copy-on-write or log-structured filesystem
   (APFS, most SSDs) -- once the secret is rotated on both ends (steps 2 and 4), a
   leftover local copy of the OLD private half is worthless to an attacker regardless of
   how it is removed, because the tap no longer trusts it. Still remove it, as hygiene:
   ```sh
   rm -rf "$key_dir"
   ```
6. **Re-run the pre-flight check** (section 2) to confirm exactly one write-capable key
   is now registered, then prove the pair actually works: dispatch `release_brew` (or,
   outside a real release, a scoped test push to a throwaway branch on the tap using the
   same `ssh-key` checkout pattern) before trusting the rotation for the next release.

## 4. What this page does not cover

Automating the pre-flight check as a scheduled CI job or a release-runbook gate step is
future work (E025 build-phase scope was the procedure and the check command, not wiring
it into a workflow trigger) — see `Program/OpenKai/Release_v0.1.016/E025_CI_TRUSTED_RELEASE/EPIC_SPEC.md`
part (c). Nothing in this page changes `docs/RELEASE_SOP.md`'s consent gate; running the
pre-flight check is an ungated, read-only action under that SOP's existing rules.
