## What + why

<!-- one paragraph: what changed and why. Link the issue. -->

## Evidence

<!-- the command output or test run proving it works. Required — PRs without evidence are not reviewed. -->

## Checklist

- [ ] `npm run build && npm run typecheck` green
- [ ] `npm test` green (new behaviour has a failing-without-the-change test)
- [ ] `scripts/security-audit.sh` green
- [ ] No new runtime dependency (or the one-paragraph justification is above)
- [ ] TUI changes use theme tokens only; overlays carry the canonical footer
- [ ] Touched no session-protocol internals — OR this PR includes the v2 design note (see CONTRIBUTING)
