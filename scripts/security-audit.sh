#!/usr/bin/env bash
# security-audit — E001 per-increment security gate, automatable half.
# See Program/Release_v0.1.0/E001_OPENKAI_V1/SECURITY.md.

set -euo pipefail
cd "$(dirname "$0")/.."

failures=0

echo "== 1. Secret scan (tracked files) =="
# API-key/token shapes in tracked source. .env and .openkai are gitignored;
# this scan proves nothing tracked carries a secret.
secret_hits="$(git grep -nE '(sk-or-[A-Za-z0-9_-]{20,}|nvapi-[A-Za-z0-9_-]{20,}|sk-kim[A-Za-z0-9_-]{10,}|fw_[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9_-]{20,}|BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY)' -- . ':!*.md' || true)"
if [ -n "${secret_hits}" ]; then
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
