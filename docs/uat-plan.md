# OpenKai UAT plan

## Goal

Prove the current E023 user contracts before release review. This plan does not claim a released version and does not substitute mocks for clean-host or administrator-token checks.

## Required scenarios

| Scenario | Pass condition |
| --- | --- |
| Public TUI startup | `openkai` starts; `/help`, `/login`, `/model`, `/settings` are usable. |
| Beginner controls | `.`, `Ctrl+R`, `Ctrl+D`, and `Alt+A` match `docs/tui-first-steps.md`. |
| Advisor default | Two-model teamwork starts enabled; deliberate one-model mode works globally and per child agent. |
| Fusion | `/fusion help` and `/fusion <task>` produce the Architect/Builder/Judge verdict contract. |
| Cortex status | `/cortex status`, `/memory stats`, and missing-writer errors give actionable next steps. |
| Cortex install/register | Clean local install and confirmed registration succeeds with a valid administrator token. |
| Provider selection | Selection reports live/pending/failed accurately and does not copy a chat key. |
| Public installation | Clean host installs `openkai`, runs `openkai --version`, and launches the TUI. |

## Evidence

For each scenario record the machine/OS, command or TUI input, relevant model/provider and Cortex state, expected result, observed result, and timestamp. Attach screenshots only when they prove a rendered TUI state; do not replace behavioral evidence with a screenshot.

## Exit

All local code checks, focused tests, and the three external acceptance scenarios must be recorded before release review. See [TEST_GUIDE.md](TEST_GUIDE.md) and [the finalization handoff](HANDOFF_GITHUB_OPENKAI_FINALISATION.md).
