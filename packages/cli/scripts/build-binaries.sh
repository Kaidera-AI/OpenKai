#!/usr/bin/env bash
# build-binaries — compile the openkai CLI into standalone per-platform
# binaries via bun (pi-mono pattern, ADR OK-8 / E001 Inc 08).
#
# Usage: packages/cli/scripts/build-binaries.sh [target...]
#   default target: the current platform.
# Output: packages/cli/bin/openkai-<target> (gzip not applied; the release
# packaging step owns compression + witness signing).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTRY="${ROOT}/dist/index.js"
OUTDIR="${ROOT}/bin"

if [ ! -f "${ENTRY}" ]; then
    echo "ERROR: ${ENTRY} missing — run npm run build first" >&2
    exit 1
fi

if [ "$#" -gt 0 ]; then
    TARGETS=("$@")
else
    case "$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)" in
        darwin-arm64)  TARGETS=("bun-darwin-arm64") ;;
        darwin-x86_64) TARGETS=("bun-darwin-x64") ;;
        linux-arm64)   TARGETS=("bun-linux-arm64") ;;
        linux-x86_64)  TARGETS=("bun-linux-x64") ;;
        *) echo "ERROR: unmapped platform $(uname -s)-$(uname -m)" >&2; exit 1 ;;
    esac
fi

mkdir -p "${OUTDIR}"
for target in "${TARGETS[@]}"; do
    name="openkai-${target#bun-}"
    echo "compiling ${name}..."
    bun build --compile --minify \
        --define=OPENKAI_BUILD_CHANNEL:'"standalone"' \
        --target="${target}" "${ENTRY}" --outfile "${OUTDIR}/${name}" >/dev/null
    echo "  -> ${OUTDIR}/${name}"
done
