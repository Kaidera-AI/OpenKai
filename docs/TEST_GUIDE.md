# OpenKai UAT guide

Run these against the public `openkai` command or an equivalent built development executable. Record what you actually observe; do not turn an unavailable credential or external service into a passing result.

## 1. First-run path

1. Launch `openkai`.
2. Confirm `/help`, `/login`, `/model`, and `/settings` are available.
3. Confirm `.` continues an active conversation, `Ctrl+R` finds/reuses a prior message, and `Ctrl+D` preserves an unfinished draft when leaving.
4. Compare the visible beginner guidance with `docs/tui-first-steps.md`.

## 2. Two-model teamwork and steering

1. In **Settings → Model**, confirm **Two-model teamwork** is enabled by default.
2. Confirm you can deliberately turn it off for a one-model session.
3. Create or wait for a worker agent, press `Alt+A`, select it, and press `Enter`.
4. Send a concrete steering message and confirm it appears in that worker's session.

## 3. Fusion

1. Run `/fusion help`.
2. Run `/fusion <a real hard question>` with authenticated models.
3. Confirm the verdict identifies Architect, Builder, and Judge.
4. Confirm it has agreement, compared choices, retained choice, discarded ideas when applicable, and checks before acting.
5. Induce or observe a failed role only in a safe test environment; confirm no false Judge verdict is shown.

## 4. Cortex without sharing

1. Set Memory Backend to Cortex or set a managed project environment lane.
2. Run `/cortex status` and `/memory stats`.
3. Confirm transcript ingest is off by default.
4. With a project that lacks a default writer, attempt a controlled memory write and confirm OpenKai refuses before sending the write.

## 5. Cortex installation and registration

Only perform this on a disposable/approved local environment.

1. Run `/cortex preflight`.
2. Run `/cortex install`; confirm it asks before installation.
3. With a real `CORTEX_ADMIN_TOKEN`, run `/cortex register <project> <agent> <role>`; confirm it asks before registration.
4. Run `/cortex agent <name> <role> [model]` and `/cortex doctor`.
5. Save and search a clearly marked test memory, then remove/clean it under project policy.

## 6. Provider application

1. Choose embedding/rerank entries in **Settings → Memory → Cortex Ingest**.
2. Confirm `/cortex status` names the last outcome as live, pending, or failed.
3. Confirm the active chat-provider key was not copied into the OpenKai provider selection.
4. With approved provider/admin credentials, verify actual live application separately.

## 7. Public installation

On a clean host or container:

1. Use a public package/installer or release asset.
2. Confirm the installed command is `openkai`.
3. Run `openkai --version` and launch the TUI.
4. Confirm release asset and installer output use `openkai-*` names.

## Report format

For every failure include: command/input, operating system, install channel, model/provider state, Cortex endpoint mode if relevant, observed output, expected result, and a minimal reproduction.
