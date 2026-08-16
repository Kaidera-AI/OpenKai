# Installing OpenKai

> **Pre-release status.** `openkai` is not published to npm yet and there is
> no public release page. Both commands below install from a locally built
> artifact. The published forms are noted so this page needs only a one-line edit
> at release; do not copy them yet — they will fail.

Requires Node.js >= 22.19. The binary channel additionally requires
[bun](https://bun.sh) to compile.

## Channel 1 — npm

At release: `npm install -g openkai`.

Until then, pack the workspaces and install the tarballs. `--prefix` keeps this
out of your real global install:

```bash
npm run build
npm pack ./packages/core ./packages/cli
npm install -g --prefix /tmp/openkai ./openkai-core-0.0.0.tgz ./openkai-cli-0.0.0.tgz
export PATH="/tmp/openkai/bin:$PATH"
```

The leading `./` on the pack arguments is required — `npm pack packages/core`
resolves as the GitHub shorthand `github:packages/core` and fails with a git
authentication error.

This channel is **pinned at build time and never self-mutates** — `openkai info`
reports `channel: npm`. Upgrading means installing a newer package.

## Channel 2 — standalone binary

At release: download `openkai-<platform>` from the release page.

Until then, compile it. The script defaults to your current platform and accepts
explicit bun targets (`bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-arm64`,
`bun-linux-x64`):

```bash
npm run build
packages/cli/scripts/build-binaries.sh
packages/cli/bin/openkai-darwin-arm64 info    # runs in place; no install step needed
```

```text
compiling openkai-darwin-arm64...
  -> /path/to/packages/cli/bin/openkai-darwin-arm64
```

Copy it onto your `PATH` as `openkai` when you want it permanently. Unlike
Channel 1 this build reports `channel: standalone` and supports self-upgrade
and rollback — see
[the onboarding walkthrough](onboarding.md#5-upgrades-and-rollback).

## Verify

```bash
openkai info
```

## Measured install-to-first-run

Channel 1 executed into a throwaway prefix on darwin/arm64, Node v24.11.1.
Across three runs: **13.3–15.3s** on a cold npm cache, **6.0s** warm — against
a five-minute budget. One cold run, verbatim and unedited:

```text
$ time (npm install -g --prefix "$CLEAN/prefix" openkai-core-0.0.0.tgz openkai-cli-0.0.0.tgz && openkai info)
added 193 packages in 12s
openkai 0.0.0
node v24.11.1 · darwin/arm64

mode: standalone-local (no CORTEX_PROJECT — local persistence only)
model catalogue: 346 OpenRouter models bundled
openrouter key: MISSING (chat/fuse need it)

local state (/private/tmp/openkai-cold.VtaMRH):
  sessions: 0
  fusion runs: 0
  shadow-git: none

upgrade:
  channel: npm (pinned at build time, never self-mutates)
  current: 0.0.0
  check availability: openkai upgrade --check

13.342 total
```

193 packages is correct — the CLI has four direct dependencies that pull the
rest transitively.

`shadow-git: none` and `openrouter key: MISSING` are correct for a fresh
machine; [onboarding](onboarding.md) covers both.
