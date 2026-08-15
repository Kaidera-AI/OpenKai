# Onboarding walkthrough

From a finished [install](install.md) to your first run.

## 1. First-run setup

`chat` and `fuse` call OpenRouter and need a key. Nothing else does — `info`,
`sessions` and `undo` work without one.

```bash
export OPENROUTER_API_KEY=your_key_here
```

Optional: `OPENKAI_MODEL` overrides the default chat model.

## 2. Self-check

```bash
openkai info
```

A fresh machine prints exactly this shape (`info` always exits 0):

```text
openkai 0.0.0
node v24.11.1 · darwin/arm64

mode: standalone-local (no CORTEX_PROJECT — local persistence only)
model catalogue: 346 OpenRouter models bundled
openrouter key: MISSING (chat/fuse need it)

local state (/Users/you/project):
  sessions: 0
  fusion runs: 0
  shadow-git: present

upgrade:
  channel: npm (pinned at build time, never self-mutates)
  current: 0.0.0
  check availability: openkai upgrade --check
```

`standalone-local` is the correct and expected mode for a new install — it is
not an error. `local state` is your **current directory**, since sessions and
snapshots live in `./.openkai/`; run `info` from your project root.

## 3. Cortex connection (optional)

OpenKai runs fully standalone. To attach it to a Cortex memory plane, set
`CORTEX_PROJECT` (and `CORTEX_API_URL` if not the default). `info` then reports
one of two further modes:

- `mode: KOS-managed (project <name>) — cortex-api <v> healthy, event backend <backend>`
- `mode: degraded — CORTEX_PROJECT set but API unreachable; local persistence only`

`degraded` still works; only the shared memory plane is unavailable.

## 4. The TUI feature floor

`openkai` (or `openkai tui`) launches the TUI. `openkai chat --prompt "<text>"`
is the non-TUI single-turn form and needs `--prompt`.

**Permission prompts.** No file write or command runs unattended. A gated
mutation raises an overlay with the diff and three choices:

| Choice | Effect |
| --- | --- |
| `Allow once` | approve this call only |
| `Allow always` | approve identical calls for this session |
| `Reject` | refuse the call |

**Undo.** A shadow-git snapshot is taken before every approved mutation.

```bash
openkai undo              # restore the previous snapshot
openkai undo --history    # list snapshots, newest first
```

`/undo` does the same from inside the TUI. A fresh machine reports
`no snapshots yet` until you approve a mutation.

**Command palette.** `Ctrl+K` opens a fuzzy palette over every slash command
and keybinding. Other bindings: `Ctrl+O` thinking density, `Ctrl+S` stash/pop
the draft, `Esc Esc` clear it, `Shift+Enter` newline, `Ctrl+C` quit.

**Attention.** When a turn ends while the terminal is **unfocused**, OpenKai
rings the bell and posts an OSC 9/777 notification, and the status chip turns
amber. It stays quiet while you are watching, and a terminal without focus
reporting stays quiet always.

## 5. Upgrades and rollback

The channel is stamped at build time; `info` reports which one you have.

**npm channel** — pinned, never self-mutates. There is no in-place command;
upgrade by installing a newer package. `openkai upgrade --check` on this channel
does not probe for versions, it just restates the pin:

```text
openkai upgrade — channel: npm (pinned at build time)
npm installs never self-mutate. Upgrade explicitly with:
  npm install -g @openkai/cli@<version>
```

**Standalone channel** — self-upgrade with verification:

```bash
openkai upgrade --check              # is a newer version available?
openkai upgrade                      # download, verify, swap
openkai upgrade --version <version>  # target a specific newer version
openkai upgrade --rollback           # swap back to the previous binary
```

`--version` moves **forward only** — the target must compare strictly greater
than what you are running, so it cannot be used to downgrade. Use `--rollback`
for that: every swap keeps the outgoing binary, so rollback is always available,
and it keeps working even with the kill-switch on. Upgrades whose payload fails
its SHA-256 witness check are refused and leave the binary untouched.

**Kill-switch** — pin the version and disable self-upgrade entirely:

```bash
export OPENKAI_AUTO_UPDATE_ENABLED=false
```

OpenKai has **no background update check**: nothing self-mutates unless you run
`openkai upgrade`. The kill-switch hard-refuses that command (exit 1, no swap);
`--rollback` is deliberately exempt.

> **Pre-release:** the standalone channel's default manifest URL
> (`https://openkai.dev/releases/latest.json`) is not live yet, so `--check`
> currently fails with `check failed: Unable to connect. Is the computer able
> to access the url?`. That is expected, not a broken install. Point
> `OPENKAI_MANIFEST_URL` at your own manifest to exercise the flow.
