#!/usr/bin/env sh
# OpenKai installer — curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh
#
# Downloads the standalone binary for your platform from the latest GitHub
# release, then fetches the companion <asset>.sha256. When a checksum is
# published it is verified (shasum/sha256sum) BEFORE the binary is moved,
# chmodded, or executed; when none is published the installer prints a loud
# "TLS-only install" warning and continues. Installs to ~/.local/bin
# (override with OPENKAI_PREFIX). No root, no node, no build tools required.

set -eu

REPO="Kaidera-AI/OpenKai"
VERSION="${OPENKAI_VERSION:-v0.01.001}"
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

asset="openkai-$os-$arch"
url="https://github.com/$REPO/releases/download/$VERSION/$asset"

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

fetch "$url" "$tmp/openkai"

# Verify the published checksum, when one exists, before touching DEST.
if fetch "$url.sha256" "$tmp/openkai.sha256" 2>/dev/null; then
    expected="$(cut -d' ' -f1 < "$tmp/openkai.sha256" | tr -d '[:space:]')"
    # Accept only a bare 64-char hex digest.
    if [ "${#expected}" -ne 64 ] || [ -n "$(printf '%s' "$expected" | tr -d '0-9a-fA-F')" ]; then
        expected=""
    fi
    if [ -n "$expected" ]; then
        if command -v shasum >/dev/null 2>&1; then
            actual="$(shasum -a 256 "$tmp/openkai" | cut -d' ' -f1)"
        elif command -v sha256sum >/dev/null 2>&1; then
            actual="$(sha256sum "$tmp/openkai" | cut -d' ' -f1)"
        else
            echo "openkai: WARNING — checksum published but neither shasum nor sha256sum is available;" >&2
            echo "openkai: WARNING — installing WITHOUT verification (TLS-only install)." >&2
            actual="$expected"
        fi
        if [ "$actual" != "$expected" ]; then
            echo "openkai: CHECKSUM MISMATCH for $asset" >&2
            echo "openkai:   expected sha256: $expected" >&2
            echo "openkai:   actual   sha256: $actual" >&2
            echo "openkai: refusing to install — the download may be corrupted or tampered with." >&2
            exit 1
        fi
        echo "openkai: sha256 verified ($expected)"
    else
        echo "openkai: WARNING — $url.sha256 did not contain a usable sha256 digest;" >&2
        echo "openkai: WARNING — installing WITHOUT verification (TLS-only install)." >&2
    fi
else
    echo "openkai: WARNING — no checksum published at $url.sha256;" >&2
    echo "openkai: WARNING — installing WITHOUT verification (TLS-only install)." >&2
fi

mkdir -p "$DEST"
mv "$tmp/openkai" "$DEST/openkai"
chmod +x "$DEST/openkai"

echo "openkai: installed to $DEST/openkai"
"$DEST/openkai" --version 2>/dev/null || true

case ":$PATH:" in
    *":$DEST:"*) ;;
    *) echo "openkai: add $DEST to your PATH, e.g.: export PATH=\"$DEST:\$PATH\"" ;;
esac
echo "openkai: run 'openkai info' to self-check, then 'openkai' to start."
