# Dogfood campaign — 0.1.10 dev line

**Rule of the campaign:** real work, not scripted pokes. Use `openkai-next` for
everything you'd normally do in a terminal this week; the drives in
`docs/TEST_GUIDE.md` are the checklist when you want to be deliberate.

## Setup (once)

```bash
openkai-next --version   # expect 0.1.9+dev (built from the current tip)
openkai-next info        # providers, catalogue, state
```

`openkai-next` is rebuilt and reinstalled after every landed increment — if
`--version` looks stale, say so (that's itself a finding class).

## What to record (the anomaly template)

Anything that feels wrong goes in a note with these fields — paste-ready for a
handoff:

```
WHAT: <what you did — one line>
SAW: <what the screen/session did>
EXPECTED: <what you expected>
WHEN: <the session was… (booting / mid-turn / tool running / idle / settings open)>
CRASH?: <if the TUI died: the FULL stderr block verbatim — "openkai crashed (terminal restored): …">
```

## Priority watch-list (the surfaces that changed most in 0.1.9)

1. **Turn aliveness** — during any long turn: is the work visible? (shimmer
   activity, tool card states, the ✓ settled row at the end). Finished vs
   crashed must never be ambiguous.
2. **Permissions** — deny a write/bash at the overlay once: the red row should
   name the tool + target + reason + where to change it. Then `/autonomy` →
   "high — full access" for a stretch of trusted work.
3. **Mouse** — click-to-cursor in the composer; drag-select; wheel. Any stray
   digits or a wedge = the stack trace, verbatim.
4. **Magic keywords** — `ultrathink`/`ultrareview` on real tasks; the shimmer;
   the fusion verdicts' quality.
5. **Sessions** — /rename, /resume, /fork, /tree across a multi-day project.
6. **Updates** — `openkai update` on each channel as 0.1.10 approaches.

## Cadence

- Findings land as they happen — no batching needed; each one becomes a handoff.
- The campaign closes when you say so; the 0.1.10 cut follows the E020 decision.
