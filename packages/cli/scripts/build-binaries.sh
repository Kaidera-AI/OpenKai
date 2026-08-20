#!/usr/bin/env bash
# build-binaries — compile the openkai CLI into standalone per-platform
# binaries via bun (pi-mono pattern, ADR OK-8 / E001 Inc 08).
#
# Usage: packages/cli/scripts/build-binaries.sh [target...]
#   default target: the current platform.
# Output: packages/cli/bin/openkai-<target> (gzip not applied; the release
# packaging step owns compression + witness signing).
#
# Release-key pin (E017 inc 09): the base64 DER SPKI Ed25519 PUBLIC key below
# is compiled in via --define. A pinned build verifies manifest signatures
# fail-closed (unsigned or invalid manifests are refused). The matching
# PRIVATE key never lives in the repo — it signs manifests at release time
# (packages/cli/scripts/sign-manifest.mjs, OPENKAI_RELEASE_PRIVATE_KEY).

set -euo pipefail

# OpenKai release signing public key (generated 2026-08-19; custody: CTO).
OPENKAI_RELEASE_PUBLIC_KEY_PIN="MCowBQYDK2VwAyEA1c1pWQeIn8V1uihqu28f0680kt8jUDXddOE35VrW67U="

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
        --define=OPENKAI_RELEASE_KEY:"\"${OPENKAI_RELEASE_PUBLIC_KEY_PIN}\"" \
        --target="${target}" "${ENTRY}" --outfile "${OUTDIR}/${name}" >/dev/null
    echo "  -> ${OUTDIR}/${name}"
done
