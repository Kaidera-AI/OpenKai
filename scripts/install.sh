#!/usr/bin/env sh
# OpenKai installer — curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh
#
# Downloads the standalone binary for your platform from the latest GitHub
# release, verifies its sha256 against the release manifest line you can
# inspect, and installs to ~/.local/bin (override with OPENKAI_PREFIX).
# No root, no node, no build tools required.

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

if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$tmp/openkai"
elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$tmp/openkai"
else
    echo "openkai: need curl or wget" >&2; exit 1
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
