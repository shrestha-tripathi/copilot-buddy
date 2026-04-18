# Installing Copilot Buddy

Two pieces:

1. **Daemon** (`copilot-buddy`) — a small Go binary that wraps the GitHub Copilot CLI SDK and exposes HTTP+SSE to the extension.
2. **Chrome extension** — an MV3 side panel that talks to the daemon at `http://127.0.0.1:8770` by default.

## 0. Prerequisites

- The official **Copilot CLI** must be installed and on `PATH` and you must be signed in (`copilot --version` and `copilot auth login`). The Go SDK shells out to it.
- **Chrome 116+** for the side panel API.

## 1. Install the daemon

Pick the right binary from `release/`:

| OS | File |
|---|---|
| Linux x86_64 | `copilot-buddy_linux_amd64` |
| Linux arm64 | `copilot-buddy_linux_arm64` |
| macOS Intel | `copilot-buddy_darwin_amd64` |
| macOS Apple Silicon | `copilot-buddy_darwin_arm64` |
| Windows x86_64 | `copilot-buddy_windows_amd64.exe` |

Verify the checksum against `SHA256SUMS`, then move the binary to a stable location:

```bash
# Linux / macOS
chmod +x copilot-buddy_linux_amd64
mv copilot-buddy_linux_amd64 ~/.local/bin/copilot-buddy
```

```powershell
# Windows
Move-Item copilot-buddy_windows_amd64.exe $env:USERPROFILE\bin\copilot-buddy.exe
```

## 2. Run it once to mint a token

```bash
copilot-buddy --port 8770 --origins chrome-extension://<your-extension-id>
```

On first run it prints a 64-char hex bearer token and persists it to `~/.copilot-buddy/config.json`. **Copy the token** — the extension's onboarding screen needs it.

If you don't yet know the extension id, start it with `--origins http://127.0.0.1` first; you can rotate later by editing `config.json`.

## 3. Auto-start the daemon

Pick the right sample under `release/install/`:

- **Linux** — `copilot-buddy.service` (systemd user unit). Copy to `~/.config/systemd/user/`, then `systemctl --user enable --now copilot-buddy.service`.
- **macOS** — `dev.copilot-buddy.plist` (launchd user agent). Copy to `~/Library/LaunchAgents/`, then `launchctl bootstrap gui/$UID ...`.
- **Windows** — `install-windows.ps1` (registers a scheduled task that runs at logon).

Each sample has the exact commands in its header comment. Edit the binary path and `--origins` extension id before running.

## 4. Install the Chrome extension

1. Unzip `copilot-buddy-extension-<ver>.zip` somewhere (it's not on the Web Store yet).
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, point at the unzipped folder.
3. Note the extension id (e.g. `abcdefghij...`) and update `--origins chrome-extension://<id>` on the daemon.
4. Pin the toolbar icon, click it — the side panel opens.
5. Paste the bearer token into the onboarding screen.

You should see `daemon online` in the header and be able to start a session.
