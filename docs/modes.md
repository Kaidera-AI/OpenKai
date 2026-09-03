# Ways to use OpenKai

## Interactive TUI

```sh
openkai
```

This is the normal mode. It supports model selection, settings, task agents, Agent Hub, Fusion, and Cortex controls.

## One-shot prompt

```sh
openkai -p "Explain this project"
```

The command processes the prompt and exits.

## Continue or resume

```sh
openkai --continue
openkai --resume
```

Use `.` inside the TUI to tell the current agent to continue the active conversation.

## ACP editor integration

```sh
openkai --mode acp
```

ACP speaks JSON-RPC over standard input/output and is normally launched by an ACP-capable editor rather than typed directly into an interactive terminal.

## Profiles

```sh
openkai --profile work
```

A profile separates local credentials, settings, caches, and session state. It does not automatically create or select a Cortex project.

## Two-model and Fusion modes

Two-model teamwork is a normal session setting, not a separate command mode. The main model works and an advisor checks it. Disable it in **Settings → Model → Two-model teamwork** for a deliberate single-model session.

Fusion is an explicit TUI command, not a headless public CLI mode:

```text
/fusion your difficult task
```

See [Fusion](fusion.md) and [Commands](commands.md).
