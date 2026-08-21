#!/usr/bin/env bash
# security-audit — E001 per-increment security gate, automatable half.
# See Program/Release_v0.1.0/E001_OPENKAI_V1/SECURITY.md.

set -euo pipefail
cd "$(dirname "$0")/.."

failures=0

# Fail CLOSED outside a git work tree (E019 S5): `git grep` dies with
# "not a git repository" in a source archive, and the old `|| true` read
# that error as "no hits" — the gate printed PASSED having scanned nothing.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "FAIL: not a git work tree — the tracked-file secret scan cannot run here."
    echo "Run the audit from a git clone, not a source archive."
    echo "SECURITY AUDIT FAILED (preconditions)"
    exit 1
fi

echo "== 1. Secret scan (tracked files) =="
# API-key/token shapes in tracked source. .env and .openkai are gitignored;
# this scan proves nothing tracked carries a secret.
#
# This list MIRRORS SECRET_PREFIXES in packages/core/src/secrets.ts — the two
# are separate implementations of one list, and E002-F2 was them drifting
# apart (the scan matched only sk-or- and sk-kim, so a committed Anthropic
# sk-ant- or OpenAI sk-proj- key passed clean while the runtime redactor
# caught that same shape). The drift test in security-repro-e002.test.ts
# asserts every prefix in secrets.ts appears below; update both together.
#
# Thresholds are {20,} here vs {10,} in secrets.ts on purpose: this scan runs
# over tracked source where a false positive blocks the gate, and a real key
# is always long.
# git grep exits 0 = hits, 1 = clean, >=2 = the scan itself failed. The old
# `|| true` collapsed all three into "clean" (E019 S5) — discriminate.
# Pattern list carries tgp_v1_ (Together) from the E002 redaction union on main.
grep_status=0
secret_hits="$(git grep -nE '(sk-[A-Za-z0-9_-]{20,}|csk-[A-Za-z0-9_-]{20,}|nvapi-[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{20,}|fw_[A-Za-z0-9_-]{20,}|tgp_v1_[A-Za-z0-9_-]{20,}|xai-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[opusr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY)' -- . ':!*.md')" || grep_status=$?
if [ "${grep_status}" -ge 2 ]; then
    echo "FAIL: git grep exited ${grep_status} — the secret scan did not run"
    failures=$((failures + 1))
elif [ -n "${secret_hits}" ]; then
    echo "FAIL: possible secrets in tracked files:"
    echo "${secret_hits}" | head -10
    failures=$((failures + 1))
else
    echo "ok: no secret patterns in tracked files"
fi

echo "== 2. Dependency audit (high+) =="
if npm audit --audit-level=high >/dev/null 2>&1; then
    echo "ok: npm audit clean at high"
else
    echo "FAIL: npm audit reported high/critical findings:"
    npm audit --audit-level=high 2>&1 | tail -15
    failures=$((failures + 1))
fi

echo "== 3. Security-relevant tests =="
if npm test >/dev/null 2>&1; then
    echo "ok: test suite green"
else
    echo "FAIL: test suite is not green"
    failures=$((failures + 1))
fi

if [ "${failures}" -gt 0 ]; then
    echo "SECURITY AUDIT FAILED (${failures} section(s))"
    exit 1
fi
echo "SECURITY AUDIT PASSED"
