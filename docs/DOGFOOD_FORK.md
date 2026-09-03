# Dogfood drive — OpenKai source fork

Use this checklist against a built or development OpenKai executable. It is a behavioral checklist, not proof of release readiness.

## Core drive

1. **Public identity** — `openkai --version` and TUI help say OpenKai/openkai.
2. **Beginner path** — `/login`, `/model`, `/settings`, `/help`, `.`, `Ctrl+R`, `Ctrl+D`, and `Alt+A` make the same promises as `docs/tui-first-steps.md`.
3. **Two-model teamwork** — main model/advisor is on by default; switch to deliberate single-model mode in Settings and for one child agent.
4. **Fusion** — `/fusion help`, then `/fusion <task>`; see Architect, Builder, Judge, retained choice, discarded ideas, and checks. A failed role must not look like a Judge verdict.
5. **Cortex status** — `/cortex help` and `/cortex status` give a usable next step. Confirm registration refuses without the administrator token.
6. **Memory safety** — an unregistered implicit writer fails before a durable write; transcript ingest remains off until enabled.
7. **Provider truthfulness** — changing an enrichment model reports live, pending, or failed application rather than guessing.
8. **Protected actions** — confirm active approval and protected-path behavior with a harmless controlled scenario.

## External pre-release drive

On a clean environment, record:

- public installer/binary behavior and `openkai --version`;
- local Cortex install → registration with a valid administrator token; and
- selected enrichment-provider live application.

Report the exact command, environment, observed result, and failure. Do not mark an unavailable environment as passing.
