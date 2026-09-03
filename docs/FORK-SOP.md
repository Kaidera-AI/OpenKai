# Fork and branding SOP

## Purpose

OpenKai is the public product. Its source fork may retain runtime compatibility identifiers, but user-facing surfaces must present OpenKai consistently.

## Product-facing requirements

Before merging or releasing a product change, verify that these surfaces use OpenKai:

- README, installation instructions, onboarding, screenshots, and public examples;
- executable name and CLI/ACP identity (`openkai`, `OpenKai`);
- npm wrapper metadata, release assets, checksums, installers, and Homebrew formula inputs;
- terminal notification/source labels and browser-relay package documentation;
- GitHub issue/security/documentation links that belong to the product.

Release assets must use `openkai-*`; the installer must install and smoke-test `openkai`.

## Compatibility exceptions

Do not perform a blanket text replacement over the source runtime. The following can be retained when they are implementation compatibility rather than product display:

- internal package/import namespaces;
- legacy state and project discovery paths;
- internal URI schemes, worker selectors, test fixtures, lockfiles, and vendor notices;
- upstream attribution and license material.

When a technical document must mention a legacy storage location, call it a compatibility location and pair it with the public `openkai` command. Do not present it as a product name or installation path.

## Change process

1. Identify whether the changed string or asset reaches a user.
2. Reuse the existing OpenKai branding constants and package/install patterns.
3. Update every caller, workflow, manifest, test fixture, and documentation example that exposes the changed public name.
4. Run the focused tests and `bun --cwd=packages/coding-agent run check`.
5. For an installer, binary, TUI, ACP, or browser-relay change, exercise the actual generated surface before release.
6. Record any remaining compatibility exception in the finalization handoff rather than treating it as a release-ready product name.

## Attribution

Keep required license and credit notices accurate. Attribution is not a reason to reuse an upstream product identity in OpenKai help, package metadata, command examples, or GitHub-facing release materials.
