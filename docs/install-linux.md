# Install on Rocky Linux 10 x86_64

These steps install the published OpenKai **0.1.15** standalone binary in your
user account. Bun, Node.js and a source checkout are not required for this channel.
The npm and bun channels instead require **Bun >= 1.3.14** as their runtime.

## Prerequisites

- Rocky Linux 10 on native `x86_64`, with CA certificates, `curl`, `sha256sum` and
  the standard shell utilities available.
- An x86-64-v3-capable CPU, the baseline required by
  [Rocky Linux 10](https://docs.rockylinux.org/latest/releases/release_notes/10_0/).
- A regular user account. These fresh-install steps stop if an OpenKai command
  already exists in that account's `~/.local/bin`.

Check the host before downloading:

```sh
cat /etc/os-release
uname -m
getconf GNU_LIBC_VERSION
/usr/sbin/getenforce
command -v curl sha256sum
```

The native rehearsal on 6 October 2026 used Rocky **10.2**, `x86_64`, glibc **2.39**
and SELinux **Enforcing**. The commands below worked without disabling SELinux or
installing any system package.

## Install the published release

Run as your regular user, without `sudo`:

```sh
(
  set -eu
  . /etc/os-release
  [ "$ID" = rocky ]
  case "$VERSION_ID" in 10.*) ;; *) exit 1 ;; esac
  [ "$(uname -m)" = x86_64 ]
  [ ! -e "$HOME/.local/bin/openkai" ]
  [ ! -L "$HOME/.local/bin/openkai" ]

  installer="$(mktemp)"
  sums="$(mktemp)"
  trap 'rm -f "$installer" "$sums"' EXIT
  curl --fail --silent --show-error --location \
    https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh \
    --output "$installer"
  OPENKAI_VERSION=v0.1.15 OPENKAI_PREFIX="$HOME/.local" sh "$installer"

  curl --fail --silent --show-error --location \
    https://github.com/Kaidera-AI/OpenKai/releases/download/v0.1.15/SHA256SUMS.txt \
    --output "$sums"
  expected="$(awk '$2 == "openkai-linux-x64" {print $1}' "$sums")"
  actual="$(sha256sum "$HOME/.local/bin/openkai" | awk '{print $1}')"
  [ "${#expected}" = 64 ]
  [ "$actual" = "$expected" ]
  printf 'verified SHA-256: %s\n' "$actual"

  version="$("$HOME/.local/bin/openkai" --version)"
  printf '%s\n' "$version"
  [ "$version" = openkai/0.1.15 ]
  "$HOME/.local/bin/openkai" --help
  "$HOME/.local/bin/openkai" --smoke-test
)
```

The rehearsal downloaded a **194,409,952-byte** binary with SHA-256
`b39a9a7beae5d4e0285801961a88d6083015ef3e682451a6b84f76659ac59d02`.
Version printed `openkai/0.1.15`, help exited 0, and smoke printed `smoke-test: ok`
and exited 0. Require the digest and all runtime checks to succeed; installer
exit 0 alone is not sufficient.

## Select the verified command

After the install checks succeed, put the verified user command first on `PATH`:

```sh
export PATH="$HOME/.local/bin:$PATH"
command -v openkai
openkai --version
```

The selected path must be your `~/.local/bin/openkai`, and the version must be
`openkai/0.1.15`. These verification commands need no provider key or model call.
See [the installation guide](install.md#first-time-setup) for provider setup.
