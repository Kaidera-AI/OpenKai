# Contributing to OpenKai

OpenKai is building the agent harness + TUI with durable memory (Cortex) and multi-model fusion. Contributions are welcome — this file is the whole contract.

## Setup

```bash
git clone <repo-url> && cd OpenKai
npm install
npm run build && npm run typecheck && npm test
```

Node ≥ 22.19. No other global dependencies (bun only for building standalone binaries).

## The bars every PR must clear

1. **Tests green.** `npm test` — deterministic and offline (the pi-ai faux provider scripts model responses; no network, no keys). New behaviour needs a test that fails without the change.
2. **Typecheck green.** `npm run typecheck` — strict TS, no `any` casts of unvalidated data.
3. **Security audit green.** `scripts/security-audit.sh` (secret scan + `npm audit` + test suite).
4. **Design tokens only.** In the TUI, `packages/cli/src/tui/theme.ts` is the only colour source. Ad-hoc colour literals are a review defect. Every overlay carries the canonical footer (`↑/↓ Navigate · Enter Select · ESC Cancel`).
5. **Evidence, always.** Claims in PRs (performance, "works", "tested") carry the reproducer or command output. Fabricated evidence is the one unforgivable failure mode here — it has burned this project before and it ends participation.
6. **No new dependency without justification.** Patterns over linkage (ADR §5); every added dependency needs a one-paragraph case in the PR.

## Where to start

- Issues labelled **`good first issue`** are scoped, reviewed, and have acceptance criteria.
- Issues labelled **`help wanted`** are bigger; comment before starting so we don't collide.
- The live program plan is `Program/Release_v0.1.0/E001_OPENKAI_V1/` — the epic spec shows the increments and what's unclaimed.

## PR shape

- One concern per PR. Reference the issue.
- The PR template checklist runs: build, typecheck, tests, security audit.
- If you touch the session protocol (`packages/core/src/session/transport.ts`), that's `openkai.session.v2` territory — the change needs a design note in the PR and a CPO review (it's our one strict gate).
- Commit messages: imperative, what + why, no noise.

## Licence

MIT — your contribution is MIT-licensed by opening the PR. The Strix-derived skills under `.agents/skills/` remain Apache-2.0 with their original attribution.
