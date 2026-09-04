# Install

OpenKai installs through **four channels**: Homebrew, npm, bun, and standalone
binary. All channels support `openkai upgrade` with rollback.

## Prerequisites

- **Node.js** ≥ 22.19 (for npm/bun channels)
- **macOS, Linux, or Windows** (all channels)
- **Git** (for source installs)

## Homebrew (macOS/Linux)

```bash
brew install kaidera-ai/tap/openkai
```

The formula installs the compiled binary. No node required.

## npm

```bash
npm install -g @kaidera/openkai
```

Requires Node.js ≥ 22.19. Installs the CLI globally.

## bun

```bash
bun add -g @kaidera/openkai
```

Requires Bun ≥ 1.3.14. Installs the CLI globally.

## Standalone binary

No node required. Self-contained compiled binary.

```bash
curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh
```

Or download manually from the
[releases page](https://github.com/Kaidera-AI/OpenKai/releases).

## From source

```bash
git clone https://github.com/Kaidera-AI/OpenKai.git
cd OpenKai
npm install
npm run build
npm link
```

## Verify installation

```bash
openkai info
```

Expected output:

```
openkai/0.1.11
mode: standalone (or managed)
providers: 21 configured
models: 814 available
sessions: 0 active
```

## First-time setup

```bash
# Configure a provider
echo 'OPENROUTER_API_KEY=sk-or-...' >> ~/.openkai/.env

# Or use Kaidera Manifold
echo 'KAIDERA_MANIFOLD_API_KEY=km-...' >> ~/.openkai/.env
echo 'KAIDERA_MANIFOLD_BASE_URL=https://api.kaidera.ai/v1' >> ~/.openkai/.env
echo 'KAIDERA_MANIFOLD_PROJECT_ID=your-project-uuid' >> ~/.openkai/.env

# Start OpenKai
openkai
```

## Upgrading

```bash
# Auto-detect channel and upgrade
openkai upgrade

# Check for updates (read-only)
openkai upgrade --check

# Rollback to previous version
openkai upgrade --rollback
```

Channel behaviour:

| Channel | Upgrade command | Rollback |
|---|---|---|
| Homebrew | `brew update && brew upgrade openkai` | `brew switch openkai <version>` |
| npm | `npm install -g @kaidera/openkai@latest` | `npm install -g @kaidera/openkai@<version>` |
| bun | `bun add -g @kaidera/openkai@latest` | `bun add -g @kaidera/openkai@<version>` |
| Standalone | Signed self-upgrade (Ed25519 + SHA-256) | `.previous` sidecar restore |

## Uninstall

```bash
# Homebrew
brew uninstall openkai

# npm
npm uninstall -g @kaidera/openkai

# bun
bun remove -g @kaidera/openkai

# Standalone
rm ~/.local/bin/openkai
rm -rf ~/.local/libexec/kaidera-os/openkai

# Remove config (optional)
rm -rf ~/.openkai
```

## Troubleshooting

### `openkai: command not found`

- Check the install channel: `which openkai`
- Homebrew: `brew link openkai`
- npm: `npm config get prefix` — add `<prefix>/bin` to `$PATH`
- bun: `bun config get prefix` — add `<prefix>/bin` to `$PATH`

### `Permission denied`

- Homebrew: `sudo chown -R $(whoami) /usr/local/bin/openkai`
- npm: `sudo chown -R $(whoami) $(npm config get prefix)/bin/openkai`
- Standalone: `chmod +x ~/.local/bin/openkai`

### `Module not found`

- Reinstall: `npm uninstall -g @kaidera/openkai && npm install -g @kaidera/openkai`
- Or use the standalone binary (no node dependency)

### `OPENROUTER_API_KEY is missing`

- Add to `~/.openkai/.env`: `echo 'OPENROUTER_API_KEY=sk-or-...' >> ~/.openkai/.env`
- Or use a different provider: see [Providers](providers.md)

### TUI crashes on launch

- Try standalone mode: `openkai --no-tui`
- Check terminal compatibility: `openkai info`
- Report: `openkai info --debug`
