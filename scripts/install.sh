#!/usr/bin/env sh
# OpenKai installer — curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh
#
# Downloads the standalone binary and verifies its published SHA-256 before
# touching the installed command. Missing or invalid checksums fail closed.
# Installs to ~/.local/bin (override with OPENKAI_PREFIX).
# No root, node, or build tools required.

set -eu

REPO="Kaidera-AI/OpenKai"
# Now at v0.1.14 (released 2026-09-15; tag + assets live).
# The default stays on the authorised channel until a published release moves it.
# Local release preparation must not repoint existing installations.
VERSION="${OPENKAI_VERSION:-v0.1.14}"
PREFIX="${OPENKAI_PREFIX:-$HOME/.local}"
DEST="$PREFIX/bin"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$arch" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *) echo "openkai: unsupported architecture: $arch" >&2; exit 1 ;;
esac
case "$os" in
    darwin|linux) ;;
    *) echo "openkai: unsupported OS: $os (use npm: npm i -g @kaidera/openkai)" >&2; exit 1 ;;
esac

# Prefer current public asset names; retain historical release compatibility.
asset="openkai-$os-$arch"
legacy="omp-$os-$arch"
url="https://github.com/$REPO/releases/download/$VERSION/$asset"
legacy_url="https://github.com/$REPO/releases/download/$VERSION/$legacy"

echo "openkai: downloading $asset ($VERSION)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch() {
    # fetch <url> <dest> — returns non-zero when the resource is absent.
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$1" -O "$2"
    else
        echo "openkai: need curl or wget" >&2; exit 1
    fi
}

if ! fetch "$url" "$tmp/openkai" 2>/dev/null; then
    echo "openkai: no $asset asset, trying historical $legacy name" >&2
    asset="$legacy"
    url="$legacy_url"
    fetch "$url" "$tmp/openkai"
fi

# Select the checksum for the bytes actually fetched, including legacy fallback.
if fetch "$url.sha256" "$tmp/openkai.sha256" 2>/dev/null; then
    expected="$(cut -d' ' -f1 < "$tmp/openkai.sha256" | tr -d '[:space:]')"
elif fetch "https://github.com/$REPO/releases/download/$VERSION/SHA256SUMS.txt" "$tmp/SHA256SUMS.txt" 2>/dev/null; then
    expected=""
    while read -r digest name extra; do
        if [ "$name" = "$asset" ] || [ "$name" = "*$asset" ]; then
            if [ -n "$expected" ] || [ -n "$extra" ]; then
                echo "openkai: ambiguous checksum entry for $asset" >&2
                exit 1
            fi
            expected="$digest"
        fi
    done < "$tmp/SHA256SUMS.txt"
else
    echo "openkai: no published checksum for $asset; refusing to install" >&2
    exit 1
fi
if [ "${#expected}" -ne 64 ] || [ -n "$(printf '%s' "$expected" | tr -d '0-9a-fA-F')" ]; then
    echo "openkai: missing or invalid SHA-256 for $asset; refusing to install" >&2
    exit 1
fi
expected="$(printf '%s' "$expected" | tr 'A-F' 'a-f')"
if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$tmp/openkai" | cut -d' ' -f1)"
elif command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tmp/openkai" | cut -d' ' -f1)"
else
    echo "openkai: need shasum or sha256sum; refusing an unverified install" >&2
    exit 1
fi
if [ "$actual" != "$expected" ]; then
    echo "openkai: CHECKSUM MISMATCH for $asset; installed command unchanged" >&2
    exit 1
fi
echo "openkai: sha256 verified ($expected)"

mkdir -p "$DEST"
mv "$tmp/openkai" "$DEST/openkai"
chmod +x "$DEST/openkai"

echo "openkai: installed to $DEST/openkai"
"$DEST/openkai" --version 2>/dev/null || true

case ":$PATH:" in
    *":$DEST:"*) ;;
    *) echo "openkai: add $DEST to your PATH, e.g.: export PATH=\"$DEST:\$PATH\"" ;;
esac
echo "openkai: run 'openkai --help' for commands, then 'openkai' to start."
