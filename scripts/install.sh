#!/usr/bin/env bash
# Copilot Buddy one-line installer for Linux / macOS.
#
# Downloads the latest release binary for your OS/arch, drops it into
# ~/.local/bin, and prints next-steps for loading the Chrome extension.
#
#   curl -fsSL https://raw.githubusercontent.com/shrestha-tripathi/copilot-buddy/main/scripts/install.sh | bash
#
# Override the install dir with INSTALL_DIR=/usr/local/bin, or pin a
# specific tag with VERSION=v0.2.0.

set -euo pipefail

REPO="${REPO:-shrestha-tripathi/copilot-buddy}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${VERSION:-latest}"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
info() { printf "==> %s\n" "$*"; }
err()  { printf "\033[31merror:\033[0m %s\n" "$*" >&2; exit 1; }

# --- detect OS / arch ------------------------------------------------------
uname_s="$(uname -s)"; uname_m="$(uname -m)"
case "$uname_s" in
  Linux)   os=linux ;;
  Darwin)  os=darwin ;;
  *) err "unsupported OS: $uname_s" ;;
esac
case "$uname_m" in
  x86_64|amd64) arch=amd64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) err "unsupported arch: $uname_m" ;;
esac
asset="copilot-buddy_${os}_${arch}"

# --- resolve URL -----------------------------------------------------------
if [[ "$VERSION" == "latest" ]]; then
  url="https://github.com/$REPO/releases/latest/download/$asset"
else
  url="https://github.com/$REPO/releases/download/$VERSION/$asset"
fi

# --- prerequisites ---------------------------------------------------------
if ! command -v copilot >/dev/null 2>&1; then
  err "GitHub Copilot CLI not found on PATH. Install it first: https://docs.github.com/en/copilot/github-copilot-in-the-cli"
fi

mkdir -p "$INSTALL_DIR"
target="$INSTALL_DIR/copilot-buddy"

info "Downloading $asset from $url"
if command -v curl >/dev/null 2>&1; then
  curl -fL --progress-bar -o "$target" "$url" || err "download failed"
elif command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "$target" "$url" || err "download failed"
else
  err "need curl or wget"
fi
chmod +x "$target"

# --- PATH check ------------------------------------------------------------
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) printf "\n\033[33mwarning:\033[0m %s is not on your PATH. Add it to your shell rc:\n  export PATH=\"%s:\$PATH\"\n" "$INSTALL_DIR" "$INSTALL_DIR" ;;
esac

bold ""
bold "✓ copilot-buddy installed to $target"
bold ""
cat <<EOF
Next steps:

  1. Start the daemon — it'll mint a bearer token on first run:

       copilot-buddy --origins chrome-extension://<extension-id>

     (You can leave --origins blank for now and rotate later.)

  2. Load the Chrome extension:

       a. Download copilot-buddy-extension-<version>.zip from
          https://github.com/$REPO/releases/latest
       b. Unzip it.
       c. Open chrome://extensions, enable Developer mode,
          click "Load unpacked", and pick the unzipped folder.
       d. Copy the extension id, restart the daemon with
          --origins chrome-extension://<id>.

  3. Click the toolbar icon to open the side panel and paste the
     bearer token (printed by the daemon on first launch, also stored
     in ~/.copilot-buddy/config.json).

For autostart on login see docs/install/README.md.
EOF
