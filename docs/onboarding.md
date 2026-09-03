# Onboarding

OpenKai starts as a normal terminal conversation. You can make it more powerful one choice at a time.

## First five minutes

1. Run `openkai` in the project folder.
2. Run `/login` to connect a provider.
3. Run `/model` to choose the active model.
4. Ask a small question about the folder.
5. Use `/help` when you do not recognize a command.

You do not need Cortex, subagents, Fusion, or custom agent files to begin.

## Add teamwork when useful

OpenKai normally enables two-model teamwork: the main model works and an advisor checks it. Disable **Settings → Model → Two-model teamwork** only when you deliberately want a single model.

Use `Alt+A` to open Agent Hub when the active agent creates workers. Select a worker and press `Enter` to read its progress or send a clear steering message.

Use `/fusion <task>` when one hard decision needs a deliberate Architect/Builder/Judge comparison.

## Add memory only when the project needs it

Open **Settings → Memory** and select **Cortex**. Then run `/cortex status`. If you install local Cortex, OpenKai asks first. Project registration is a separate confirmed action and requires `CORTEX_ADMIN_TOKEN`.

Transcript ingest remains off by default. Keep it off unless you intend to share those conversations with the Cortex project.

## Personalize safely

- **Profile:** `openkai --profile <name>` separates local account/settings/session state.
- **Personality:** Settings → Model → Prompt → Personality changes response style.
- **Project rules:** `AGENTS.md` captures lasting rules for the current repository.
- **Task agents:** use an advanced agent definition for a recurring worker role.

Read [TUI first steps](tui-first-steps.md) first, then [Cortex projects and agents](cortex-projects-agents.md) when you need shared memory.
