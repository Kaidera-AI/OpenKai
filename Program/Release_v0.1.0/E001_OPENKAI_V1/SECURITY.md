# E001 Security Gate — standing protocol

**Owner:** cole@openkai (security-engineer; Strix skills bound: penetration-testing, fix-security-vulnerabilities, ci-security-scanning)
**Rule:** no increment is accepted without this gate passing. Pattern source: ren's Strix skill set (ported at `.agents/skills/`) applied as *patterns* — no full Strix install required for the per-increment gate.

## 1. Per-increment gate (fast, automatable — runs on every increment)

`scripts/security-audit.sh` must pass:
1. **Secret scan** — no API keys/tokens in tracked files (pattern scan for `sk-`, `nvapi-`, `fw_`, `AIza`, `ghp_`, `xai-`, private-key blocks); `.env`/`.openkai/` never tracked.
2. **Dependency audit** — `npm audit --audit-level=high` clean; new dependencies justified against ADR §5.
3. **Injection surfaces** — new shell-executing or path-resolving code has adversarial tests (traversal, metacharacters, deny-floor bypass attempts).
4. **Test suite green** — the security-relevant tests (permission matrix, traversal guards, attribution enforcement) must exist and pass.

## 2. Per-increment review (cole, Strix patterns, white-box)

For each increment's diff, cole reviews the NEW attack surface with the penetration-testing skill's methodology (validate-by-exploitation, not flagging):

| Surface introduced | Attack class to attempt |
|---|---|
| Permission engine / gated tools | Rule-ordering bypass, deny-floor escape, symlink/encoded-path traversal, bash obfuscation, always-cache poisoning |
| Session persistence + Cortex ingest | Secret exfiltration into sessions/artifacts, cross-project scope leak, injection via session content |
| SSE client / event stream | Frame injection, cursor forgery, cross-project event leak |
| TUI rendering | ANSI/OSC escape injection from model output into the terminal (the classic agent-TUI hole) |
| Fusion (panel/synthesis/gate) | Prompt injection via role output into the synthesiser/validator; gate command injection via validator output |
| Upgrade/packaging | Supply-chain: unsigned channel, rollback to vulnerable version, downgrade attacks |
| Shadow-git undo | Restore-path escape outside cwd, object-store poisoning |

Findings are filed as Cortex handoffs with severity + reproducer; acceptance of the increment waits on critical/high closure.

## 3. Deep scans (per release)

Before v1 ships: a full white-box pentest pass (Strix OSS CLI against the repo if the operator provides the model key; otherwise the manual pattern checklist executed by cole end-to-end), plus `fix-security-vulnerabilities` workflow for anything found, plus the CI scanning skill's checklist folded into the release runbook.

## 4. Standing rules

- The security reviewer never reviews their own code (cole reviews kai/bob output; kai reviews cole's).
- Every finding ships with a reproducer — same honesty rule as benchmarks (ADR §5.7).
- Secrets live only in `.env` / `local-cortex/.env`; never in Cortex memory, sessions, artifacts, or transcripts.
- Execution is not a sandbox (ADR §5.6) — the permission engine is consent, and the gate review treats it as such.
