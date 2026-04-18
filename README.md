# Copilot Buddy

Bring the GitHub Copilot agent to **any webpage**. A Chrome side-panel extension backed by a tiny local Go daemon that wraps the official [GitHub Copilot CLI SDK](https://github.com/github/copilot-sdk).

![Copilot Buddy](https://img.shields.io/badge/Copilot-Buddy-2563eb?style=flat-square)
![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)
![Go 1.24+](https://img.shields.io/badge/Go-1.24%2B-00ADD8?style=flat-square&logo=go&logoColor=white)
![Windows](https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows)
![macOS](https://img.shields.io/badge/Platform-macOS-999999?style=flat-square&logo=apple)
![Linux](https://img.shields.io/badge/Platform-Linux-FCC624?style=flat-square&logo=linux&logoColor=black)
![License MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

> **Why?** Copilot CLI lives in your terminal. Copilot Console is a desktop app. **Copilot Buddy puts the agent in your browser** — pinned to whichever tab you're reading, with one-click "include this page" context, persistent multi-session history, and a streaming side panel that reconnects after you close it. It's the same architecture as [copilot-console](https://github.com/sanchar10/copilot-console), reimplemented in Go and adapted for the browser-extension context.

> **Platform:** Windows, macOS, and Linux. Chrome 116+ (MV3 side panel API).

---

## Features

| | Feature | Description |
|---|---|---|
| 🧭 | **Side-panel chat** | A persistent panel that lives next to any tab. Open via the toolbar icon — survives tab switches and navigation. |
| 🌐 | **One-click page context** | Toggle "Include page context" to attach the current tab's URL, title, and selected text (or visible text) to the next prompt. |
| 💬 | **Multi-session history** | Create, switch, and delete sessions from the picker. Each session has its own working directory and system prompt. Persisted to `~/.copilot-buddy/sessions/`. |
| ⚡ | **Streaming with disconnect-safe resume** | SSE streams every assistant delta. Close the panel mid-turn and reopen it — the agent keeps running and the panel reattaches from the last cursor. |
| 🛠️ | **Full agent loop** | Tool calls, reasoning steps, usage info, and turn lifecycle events all rendered inline. |
| ❓ | **Interactive Q&A** | When the agent asks a structured question (`ask_user`) or an MCP tool elicits input, a modal pops up in the panel — multiple choice, freeform, or schema-driven form. |
| 🔐 | **Local-only by design** | Daemon binds to `127.0.0.1` and protects every endpoint with a 256-bit bearer token. CORS is locked to your specific extension id. Nothing leaves your machine that didn't already go to GitHub via the Copilot CLI. |
| ♻️ | **Idle session GC** | Cold session SDK clients are torn down after 30 min of inactivity to reclaim subprocess memory; resume reconstructs them transparently. |
| 🧩 | **Per-session SDK clients** | Each session gets its own `*copilot.Session`, so working directories and system prompts can differ across tabs without cross-contamination. |
| 🧪 | **One binary, five platforms** | `make release` produces statically-linked `copilot-buddy` binaries for Linux/macOS/Windows × amd64/arm64 with `-trimpath -s -w`. |

---

## Quick install

> **Prereq:** Install and authenticate the [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) first — `copilot --version` and `copilot auth login`. The Go SDK shells out to it.

One command to grab the latest daemon binary (or upgrade in place):

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/shrestha-tripathi/copilot-buddy/main/scripts/install.ps1 | iex
```

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/shrestha-tripathi/copilot-buddy/main/scripts/install.sh | bash
```

The installer detects your OS/arch, drops `copilot-buddy` into `~/.local/bin` (or `%USERPROFILE%\bin` on Windows), and prints next steps.

Then:

1. **Start the daemon** — first launch mints a bearer token and persists it to `~/.copilot-buddy/config.json`. Copy the token from the terminal.
   ```bash
   copilot-buddy --origins chrome-extension://<extension-id>
   ```
   (You can pass `--origins http://127.0.0.1` for the very first run before you know the extension id.)

2. **Load the extension** — download `copilot-buddy-extension-<version>.zip` from the [latest release](https://github.com/shrestha-tripathi/copilot-buddy/releases/latest), unzip, then in Chrome:
   - `chrome://extensions` → enable **Developer mode**
   - **Load unpacked** → pick the unzipped folder
   - Copy the extension id, restart the daemon with `--origins chrome-extension://<id>`

3. **Open the side panel** — click the Copilot Buddy toolbar icon. Paste the bearer token into the onboarding screen. You should see `daemon online` and be able to start a session.

> For auto-start on login, manual install, or upgrading from source, see **[docs/install/README.md](docs/install/README.md)**.

### First things to try

1. **Start a session** — Click **+ New session** in the picker. Give it a name; the working directory and system prompt are optional.
2. **Chat with page context** — Open any docs page, toggle **Include page context** under the input, and ask "summarise this page in 5 bullets."
3. **Mid-turn close & reopen** — Send a long prompt, close the side panel while it's still streaming, then reopen — it picks up exactly where it left off.
4. **Switch tabs mid-session** — The panel and session state survive; the working directory of the session is what the agent operates on, not the tab's URL.
5. **Try `ask_user`** — Send "ask me a multiple-choice question about Go closures" and answer the modal.
6. **Try elicitation** — Connect any MCP server that uses elicitation; the schema renders as a form in the panel.
7. **Multiple sessions** — Create a second session in a different working directory and switch between them — each has its own model context, history, and SDK client.

---

## Command-line options

```
copilot-buddy [OPTIONS]

Options:
  --port PORT       HTTP listen port            (default: 8770)
  --host HOST       HTTP listen host            (default: 127.0.0.1)
  --origins LIST    Comma-separated allowed CORS origins
                    (typically chrome-extension://<id>)
```

### Examples

```shell
# Default, with a single extension origin
copilot-buddy --origins chrome-extension://abcdefghijklmnop

# Custom port for parallel installs
copilot-buddy --port 8771 --origins chrome-extension://abcd...

# Allow multiple extension ids (e.g. Stable + Canary builds)
copilot-buddy --origins chrome-extension://abc...,chrome-extension://def...
```

The bearer token is written to `~/.copilot-buddy/config.json` on first run and reused on every subsequent start. Delete the file (or just the `bearer_token` field) to rotate.

---

## Architecture

```
┌─────────────────────────┐                    ┌─────────────────────────┐
│  Chrome MV3 extension   │     HTTP + SSE     │   copilot-buddy daemon  │
│  (React + Vite + TS)    │ ◄────────────────► │   (Go, single binary)   │
│                         │  127.0.0.1:8770    │                         │
│  ├─ side panel UI       │  Bearer + CORS     │  ├─ HTTP router         │
│  ├─ service worker      │                    │  ├─ SSE writer          │
│  ├─ content script      │                    │  ├─ ResponseBuffer      │
│  └─ chrome.storage      │                    │  ├─ EventProcessor      │
└─────────────────────────┘                    │  ├─ SessionClient pool  │
                                               │  └─ idle-session GC     │
                                               └────────────┬────────────┘
                                                            │
                                                            ▼
                                            ┌──────────────────────────────┐
                                            │ github.com/github/copilot-sdk│
                                            │             /go              │
                                            └──────────────┬───────────────┘
                                                           ▼
                                            ┌──────────────────────────────┐
                                            │  GitHub Copilot CLI (subproc)│
                                            └──────────────────────────────┘
```

**Key design points** (mirrors copilot-console):

- **One SDK client per session.** Per-session working directory and model are fixed at session-create time, so we can't share a single client across sessions.
- **ResponseBuffer.** Every turn writes events into a per-session ring; the SSE handler is just a reader. Closing the HTTP connection does **not** stop the agent — the buffer keeps filling and `responseStatus` lets the panel resume from a cursor.
- **Synchronous handler bridge.** SDK elicitation/`ask_user` callbacks are synchronous, so we mint a request id, emit it as an SSE event, and block on a per-request channel until the panel POSTs back to `/elicitation-response` or `/user-input-response`.
- **Detached context.** `SendMessageBackground` strips cancellation from the request context (`context.WithoutCancel`) so a side-panel close never aborts the agent.

---

## Layout

```
copilot-buddy/
├── backend/                # Go daemon
│   ├── cmd/copilot-buddy/  # daemon entry
│   ├── cmd/spike/          # SDK familiarisation spike
│   ├── internal/
│   │   ├── config/         # defaults + ~/.copilot-buddy paths
│   │   ├── models/         # Event/payload structs (SSE schema)
│   │   ├── routers/        # HTTP routes (Go 1.22 patterns)
│   │   ├── server/         # http.Server + middleware (Bearer, CORS)
│   │   ├── services/       # CopilotService, SessionClient,
│   │   │                   # ResponseBuffer, EventProcessor,
│   │   │                   # pendingRequests
│   │   └── storage/        # JSON-on-disk session store
│   └── docs/sdk-events.md  # observed SDK event catalogue
├── extension/              # Chrome MV3 (React 18 + Vite + crxjs + TS)
│   ├── src/background/     # service worker (opens side panel)
│   ├── src/content/        # page-context capture
│   ├── src/sidepanel/      # React UI, Zustand stores, API client
│   └── src/shared/api/     # client, SSE parser, sessions API
├── docs/
│   ├── install/            # systemd / launchd / scheduled-task samples
│   └── plan.md             # full implementation plan
├── scripts/
│   ├── install.sh          # one-line installer (Linux/macOS)
│   ├── install.ps1         # one-line installer (Windows)
│   └── release.sh          # cross-build + zip release artefacts
└── README.md
```

---

## Configuration

All daemon state lives in `~/.copilot-buddy/`:

```
.copilot-buddy/
├── config.json     # Bearer token + future settings
├── sessions/       # One JSON file per session (metadata + history)
└── logs/           # Daemon logs (when running under systemd/launchd)
```

Environment overrides:

- `COPILOT_BUDDY_HOME` — relocate the entire data directory (used by tests).

The extension stores per-browser settings in `chrome.storage.local` (daemon URL, bearer token) and the active session id in `chrome.storage.session` (cleared on browser restart).

---

## HTTP API

All endpoints under `/api/`, all require `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/health` | Liveness check (no auth in some configs). |
| `GET`  | `/api/models` | List models exposed by the SDK. |
| `GET`  | `/api/sessions` | List persisted sessions. |
| `POST` | `/api/sessions` | Create a session (`name`, `model`, `cwd`, `system_message`). |
| `GET`  | `/api/sessions/{id}` | Fetch one session. |
| `DELETE` | `/api/sessions/{id}` | Delete a session. |
| `POST` | `/api/sessions/{id}/messages` | Send a prompt; opens an SSE stream of events. |
| `GET`  | `/api/sessions/{id}/response-stream?from=N` | Resume the in-flight SSE stream from cursor `N`. |
| `GET`  | `/api/sessions/{id}/response-status` | Snapshot of buffer state (active, cursor, error). |
| `POST` | `/api/sessions/{id}/elicitation-response` | Deliver a modal answer to a blocked SDK elicitation handler. |
| `POST` | `/api/sessions/{id}/user-input-response` | Deliver an `ask_user` answer. |

SSE event names are defined in `backend/internal/models/models.go` and mirrored in `extension/src/shared/api/events.ts`: `delta`, `step`, `usage_info`, `turn_done`, `done`, `error`, `title_changed`, `mode_changed`, `elicitation`, `ask_user`, `pending_messages`.

---

## Building from source

**Prereqs:** Go 1.24+, Node 20+, the GitHub Copilot CLI on PATH.

```bash
# Clone
git clone https://github.com/shrestha-tripathi/copilot-buddy.git
cd copilot-buddy

# Run the daemon directly
cd backend && make run

# Build the extension in dev (watch mode)
cd extension && npm install && npm run dev
```

Then load `extension/dist/` as an unpacked extension.

### Cross-platform release

```bash
bash scripts/release.sh   # produces release/ with 5 binaries + extension zip + SHA256SUMS
```

### Tests

```bash
cd backend
go test ./...                              # unit tests
go test -tags=integration ./...            # SSE resilience integration test
```

---

## Troubleshooting

- **`daemon offline` in the panel.** Make sure `copilot-buddy` is running and listening on the URL configured in the panel settings (default `http://127.0.0.1:8770`). The DaemonOffline screen has a Retry button.
- **`401 invalid token`.** The token in the panel doesn't match `~/.copilot-buddy/config.json`. Open settings (gear icon) and paste again.
- **`CORS error` in DevTools.** Restart the daemon with `--origins chrome-extension://<your-id>`. The extension id is shown on `chrome://extensions`.
- **Agent never responds.** Confirm `copilot --version` works and you're signed in (`copilot auth login`). The Go SDK proxies to the CLI subprocess.
- **Token leak / rotate.** Delete `~/.copilot-buddy/config.json` (or just the `bearer_token` field) and restart the daemon. Update the extension settings with the new token.

---

## More information

- [Manual installation & autostart](docs/install/README.md) — systemd / launchd / Windows scheduled task samples
- [Implementation plan](docs/plan.md) — phased roadmap (P0–P8) and architecture mapping from copilot-console
- [SDK events catalogue](backend/docs/sdk-events.md) — observed event types from the Copilot Go SDK
- [Architectural inspiration: copilot-console](https://github.com/sanchar10/copilot-console) — the Python desktop sibling

---

## License

MIT
