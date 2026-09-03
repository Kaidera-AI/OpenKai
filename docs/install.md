# Install OpenKai

Use one of the public installation paths below. Every path should leave an `openkai` command on `PATH`.

## Package install

```sh
npm install -g @kaidera/openkai
# or
bun install -g @kaidera/openkai
```

Verify it:

```sh
openkai --version
openkai
```

## macOS and Linux installer

```sh
curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh
```

The installer chooses a compatible prebuilt `openkai-*` binary when possible. It supports:

```sh
# Install through Bun instead of a prebuilt binary
curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh -s -- --source

# Require a prebuilt binary
curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh -s -- --binary

# Install a specific release, branch, or commit from source
curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh -s -- --ref <ref>
```

Set `OPENKAI_INSTALL_DIR` to change the binary directory. The installer verifies `openkai --version` after installation and tells you if the directory is missing from `PATH`.

## Windows PowerShell installer

```powershell
irm https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.ps1 | iex
```

Pass `--source`, `--binary`, or `--ref <ref>` using the script's PowerShell invocation form when needed. Confirm with:

```powershell
openkai --version
openkai
```

## Homebrew

```sh
brew install kaidera-ai/tap/openkai
```

## First run

```sh
openkai
```

Then:

1. `/login` connects a provider.
2. `/model` chooses the active model.
3. `/settings` changes persistent preferences.
4. `/help` explains commands inside the TUI.

See [TUI first steps](tui-first-steps.md) for the beginner path.

## Cortex is separate from installation

Installing OpenKai does not install or register a shared Cortex project automatically. From the TUI, use `/cortex status`; if you need local Cortex, use `/cortex install`. Registration is a separate confirmed action and requires `CORTEX_ADMIN_TOKEN`:

```text
/cortex register [project] [agent] [role]
```

See [Cortex projects and agents](cortex-projects-agents.md) for the full setup and privacy model.

## Troubleshooting

- **`openkai: command not found`** — add the installer directory or Bun global bin directory to `PATH`, then open a new shell.
- **Package install succeeds but startup fails** — run `openkai --version`; the installer/package post-check should expose the exact failure.
- **No model available** — open the TUI, run `/login`, then `/model`.
- **Cortex is unavailable** — this does not prevent normal OpenKai use. Run `/cortex status` for the next exact action.
