# Sessions, agents, and steering

A normal OpenKai conversation is a session. Sessions keep their own transcript, active model, and working context.

## Continue and resume

- Send `.` in the TUI to ask the current agent to continue.
- Use `openkai --continue` to continue the most recent session.
- Use `openkai --resume` to choose a prior session.
- Press `Ctrl+R` to search/reuse a message you wrote earlier.
- Press `Ctrl+D` to leave safely while preserving an unfinished draft.

## Worker agents

When an agent delegates work, press `Alt+A` to open **Agent Hub**.

1. Select a worker.
2. Press `Enter` to open its transcript and steering input.
3. Send a short concrete instruction.
4. Return to the main session with `Esc` from an empty editor.

Steering affects that live agent session. It does not become a permanent project instruction or Cortex memory by itself.

## Advisor versus worker

An advisor is a second model that quietly checks the main model's work. It is not a steerable worker. Advisor transcripts can be observed in Agent Hub, but you do not message, revive, or kill them as peers.

Two-model teamwork is enabled by default. Disable it globally in **Settings → Model → Two-model teamwork**, or disable it for an individual child agent in Agent Hub or its task-agent definition.

## Profiles and shared memory

`openkai --profile <name>` separates local session/account/settings state. A profile may use a Cortex project, but it does not create one automatically. If profiles share the same registered Cortex project, their authorized writers share durable project memory.

See [Cortex projects and agents](cortex-projects-agents.md) for project/roster setup and [Fusion](fusion.md) for an explicit three-role comparison.
