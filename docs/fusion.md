# Fusion

Fusion is an explicit, short model-team comparison for a difficult task. It is different from OpenKai's normal advisor:

- **Advisor:** the everyday second model that checks the active model while it works.
- **Fusion:** an intentional Architect + Builder + Judge run for one question.

## Run it

```text
/fusion choose a safe cache policy for this API
/fusion help
```

Run `/fusion` with no task to open the small menu for choosing or saving the Architect/Builder model pair.

## What happens

1. **Architect** gets a fresh context and makes a plan, identifies risks, and names what correct work must prove.
2. **Builder** gets a separate fresh context and proposes an independent practical answer.
3. **Judge** gets both positions and produces the verdict.

The roles may use different models, but the Judge is always a fresh synthesis role. When no dedicated judge model is configured, it can use the Architect model without sharing the Architect's context.

## Read the verdict

A successful Fusion verdict contains:

- **What the team agrees on** — shared conclusions.
- **Choices the judge compared** — the Architect and Builder positions plus the choice the Judge keeps.
- **Set aside** — ideas the Judge discarded and why.
- **Check before acting** — blind spots or unresolved disagreements.

If a role fails, OpenKai shows which role failed and preserves the surviving draft. It does not pretend a Judge reached a verdict. If the Judge cannot combine the answers, it preserves the two drafts and tells you to evaluate their evidence separately.

## Pairing and single-model mode

The normal OpenKai default is two-model teamwork: a main model and advisor. Turn it off in **Settings → Model → Two-model teamwork** when you deliberately want one model.

Fusion is not an automatic replacement for that advisor. Use it when a decision has enough uncertainty, risk, or competing implementation paths to justify a focused comparison.

For a child agent, Agent Hub (`Alt+A`) lets you decide whether that agent has an advisor. An agent definition may also set `advisor: false` for intentional single-model work.

## Boundaries

`/fusion` is the public interactive command. It does not expose shell-authored acceptance gates or a hidden headless CLI mode. The result is delivered into the active OpenKai conversation so the active agent can apply the Judge's conclusion with the operator still in control.
