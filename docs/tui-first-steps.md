# OpenKai TUI: first steps

This is the short guide for a first-time user. You do not need to know how models, profiles, or memory work before asking your first question.

## Open it

```sh
openkai
```

You will see a place to type. Write what you want help with, then press `Enter`.

Example:

```text
Explain this folder like I am new here.
```

## The three starter commands

| Type this | It does this |
| --- | --- |
| `/login` | Connects a model provider. |
| `/model` | Lets you choose a model. Think of it as choosing the brain that answers. |
| `/settings` | Lets you change saved choices such as colors, memory, and teamwork. |

Type `/help` if you forget a command. It is okay to ask OpenKai what a command means.

## Small everyday moves

| You want to… | Do this |
| --- | --- |
| Ask the last agent to keep going | Send `.` |
| Find a message you wrote earlier | Press `Ctrl+R` |
| Leave safely without losing an unfinished draft | Press `Ctrl+D` |
| See helper agents | Press `Alt+A` |
| Tell a helper agent what to do next | In Agent Hub, choose it and press `Enter` |

A helper agent is just another worker helping on part of the job. You can read what it is doing and send it one clear instruction.

## Two-model teamwork

OpenKai normally uses two models together:

- The **main model** does the work.
- The **advisor model** checks for mistakes and sends notes.

This is like having one person build a Lego set while another checks the instructions. If you want only one model, open **Settings → Model → Two-model teamwork** and turn it off. You can also turn it off for one child agent in Agent Hub.

## Fusion for a bigger question

Use Fusion when you want a careful comparison instead of one quick answer.

```text
/fusion choose a safe way to rename this API
```

Fusion creates a tiny team:

1. **Architect** — makes a plan.
2. **Builder** — makes another answer.
3. **Judge** — compares both and keeps the useful parts.

The result says what they agree on, which choice the Judge kept, what it set aside, and what to check before acting.

Type `/fusion help` for a reminder. Type `/fusion` by itself to choose the two models used for Architect and Builder.

## Optional shared memory

Cortex is a shared notebook for a project. It can help OpenKai remember decisions on a later day.

To start:

1. Open **Settings → Memory**.
2. Choose **Cortex** as the memory backend.
3. Type `/cortex status`.
4. Type `/memory stats` to see what OpenKai can use.

Do not turn on transcript sharing unless you want that conversation sent to the shared notebook. It is off by default.

## When stuck

1. Type `/help`.
2. Ask OpenKai to explain the screen or command you see.
3. Check your provider with `/login` and `/model`.
4. Check shared memory with `/cortex status`.

That is enough to get started.
