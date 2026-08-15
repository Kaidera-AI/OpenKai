# P4 Scope — Permission Engine + Protocol v2, Slice B

**Date:** 2026-08-15
**Author:** kai@openkai (lead)
**Status:** SCOPED — ready for execution dispatch
**ADR anchor:** `2026-08-14-openkai-harness-tui-ADR.md` §4 OK-5 feature floor (line 119), §6 P4 row, §5.6 honest-posture rule
**Builds on:** P4a (main @ `20fbf5c`) — pi-tui TUI shell, `SessionTransport`, JSONL v3 session store
**Supersedes in part:** `2026-08-15-p4-tui-scope.md` §7 backlog — this slice takes the permission-engine item only

---

## 1. Why this is the next slice

`packages/core/src/session/tools.ts:5` states the block in code:

> *"No write/bash until the permission engine exists (P4); the honest-posture rule (ADR §5.6) applies: execution is not sandboxed, and P2 simply doesn't expose mutation."*

OpenKai today cannot edit a file or run a command. The tool trio is read-only
(`read_file`, `list_files`, `grep`) by deliberate omission. The permission engine
is the single gate holding back the harness's core capability — it is not a
polish item, it is the unlock. Every other P4b backlog entry (rewind menu,
frecency, leader-key palette) is cosmetic next to it.

## 2. The protocol change — `openkai.session.v1` → `v2`

P4a froze the event contract as `openkai.session.v1` with **no approval channel**;
scope §2/A2 recorded that remote approval injection was *"banned by absence, not
by policy."* This slice introduces the channel, so the boundary must become
explicit policy in the same change.

**v2 adds exactly two things:**

1. **Outbound event** — emitted before a gated tool executes:
   ```ts
   { sessionId, seq, kind: "permission_request", requestId, toolCallId,
     toolName, args, preview: PermissionPreview, rule: string }
   ```
   `PermissionPreview` is a discriminated union: `{kind:"diff", path, before, after}`
   for file mutations, `{kind:"command", command, cwd}` for bash. The renderer
   branches on it; the engine never formats display strings.

2. **Inbound method** on `SessionTransport`:
   ```ts
   respond(requestId: string, decision: "once" | "always" | "reject"): void
   ```
   Tool execution awaits this. `always` is **session-scoped only** — it writes to
   in-memory session policy, never to disk config, in this slice.

**Trust boundary (mandatory, state it in the code):** `respond()` is implemented
on `InProcessTransport` only. A network transport MUST NOT accept approvals
without authentication; add a documented `throw` in any non-local transport stub
rather than a silent no-op. The v1 "banned by absence" guarantee is replaced by
an explicit refusal, not dropped.

**Versioning:** bump the documented protocol id to `openkai.session.v2`. v1
consumers (`openkai chat`, `events --print`) must keep working — a client that
ignores `permission_request` still sees a coherent stream.

## 3. The policy engine

`packages/core/src/session/permissions.ts` — pure, synchronous, no I/O:

```ts
evaluate(toolName: string, args: unknown, cwd: string): "allow" | "ask" | "deny"
```

Rules per ADR line 119, **last-match-wins glob ordering** (later rule overrides
earlier — this is the opencode semantic, do not invert it):

- Default posture: read tools `allow`; `write_file`/`edit_file` `ask`; `bash` `ask`.
- **`bash` never defaults to `allow`.** No rule set shipped in this slice may
  produce `allow` for bash.
- **Deny-by-default floor** (cannot be overridden by a later `allow` rule —
  deny is terminal): `.env`, `.env.*`, `**/*.pem`, `**/*.key`, `**/id_rsa*`,
  `.git/config`, `**/.ssh/**`. A permission engine without a deny floor is
  theatre; this is the substance.
- Paths outside `cwd` → `deny` (P4a's `resolveWithin` already refuses traversal;
  the policy layer must agree rather than duplicate the check inconsistently).

Rules are a plain array literal in this slice — **no config file, no schema, no
loader.** Config-driven rules land when there is a second consumer.

## 4. Tools unlocked

`packages/core/src/session/tools.ts` gains, each behind `evaluate()`:

- `write_file(path, content)` — full-file write; preview is a diff vs. current.
- `edit_file(path, oldString, newString)` — exact-match replace, errors if the
  match is absent or ambiguous; preview is the diff.
- `bash(command, cwd?)` — unsandboxed, per ADR §5.6 honest posture. Preview is
  the command + resolved cwd. Update the `tools.ts` header comment: the P2
  "no write/bash until the permission engine exists" note is now satisfied, and
  the honest-posture statement must remain — the gate is consent, not a sandbox.

## 5. TUI surface

`packages/cli/src/tui/permission.ts` — an overlay component:

- Carries the **identical footer grammar** as every other overlay
  (`↑/↓ Navigate · Enter Select · ESC Cancel`) — P4a scope §3.2, non-negotiable.
- Renders the diff preview with `highlightDanger` on removed lines and
  `highlight` on added; command previews render the command in a muted-left-border
  block. **All colour from `theme.ts`** — ad-hoc literals are a review defect
  (P4a scope §3.1).
- Three actions: `once` / `always (session)` / `reject`. ESC ≡ reject.
- Blocks the composer while open; the spinner must reflect *waiting on you*, not
  *model thinking* — a spinner that lies about who is blocked is the defect this
  slice most easily ships.

Syntax highlighting inside diffs is **deferred** — plain +/- with token colours
is the bar here.

## 6. Verification (acceptance)

1. `npm run build && npm run typecheck` green from clean.
2. `npm test` green, including new cases:
   - **Policy unit tests**: `.env` denied even with a trailing `allow **` rule
     (deny is terminal); last-match-wins ordering proven with two overlapping
     globs; bash never resolves to `allow`; path outside cwd denied.
   - **Round-trip test**: `permission_request` emitted → `respond("reject")` →
     tool returns a refusal result, file on disk unchanged.
   - **`always` scoping test**: second identical call in the same session does
     not re-prompt; a *new* session does.
   - **Golden-frame test**: permission overlay renders with the §5 footer grammar
     and diff colours.
3. **Tests must not mutate anything outside a `node:fs.mkdtemp` temp dir.** No
   test may invoke a destructive bash command; `echo`-class commands only.
4. `openkai chat` and `openkai events --print` regressions: unchanged behaviour
   with a v2 stream (the v1-compat requirement in §2).
5. Mode matrix unchanged from P4a: `CORTEX_PROJECT` unset → still boots, still
   persists locally, permission engine still gates.

## 7. Explicitly NOT this slice

`doom_loop` repeat-call detection; `external_directory` prompts; syntax-highlighted
diffs; persisted/config-file rules; subagent permission bubbling (blocked on P3
fusion handles); shadow-git undo; autonomy axis (off/low/med/high) layered over
the rules; third-Esc rewind; frecency history; leader-key palette.

## 8. Execution dispatch

Single handoff to **bob@openkai** (full-stack-developer): implement §2–§5 against
this contract; verify §6; return with build/test output and a captured frame of
the permission overlay. kai reviews against this scope.

## 9. Risks

- **The `always` decision is the dangerous one.** Session-scoped is the safe
  default chosen here; if execution finds itself tempted to persist it to disk,
  stop and return — that is a scope change requiring a policy decision, not an
  implementation detail.
- **Awaiting `respond()` inside the agent loop can deadlock** if the transport's
  event pump and the tool executor share a turn. Verify the pump still drains
  while a tool awaits approval; if pi-agent-core's executor is not re-entrant,
  return with the finding rather than bolting on a timeout that auto-approves.
  **An approval that times out must fail closed (reject), never allow.**
- **Diff rendering cost** on large files — truncate the preview (head/tail with
  an elision marker) rather than streaming a 10k-line diff into the overlay.
