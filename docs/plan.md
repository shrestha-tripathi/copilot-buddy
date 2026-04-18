# Chrome Extension + Go Backend for Copilot CLI

## Problem Statement

Build a Chrome extension that opens a **side panel** alongside any webpage and chats with a local **Go backend** that wraps the GitHub Copilot CLI. The architecture mirrors `copilot-console`'s patterns (per-session SDK clients, event-translating processor, disconnect-safe response buffer, SSE streaming) but reimplemented in Go with idiomatic concurrency (goroutines + channels), and adapted to the browser-extension context (page-aware, side panel UX, host permissions).

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Chrome Extension (MV3, JS/TS)                               │
│  ┌────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │  Side Panel    │  │  Service Worker │  │ Content Script│  │
│  │  (React UI)    │◄─►│  (background)   │◄─►│ (page bridge)│  │
│  │  Chat + Stream │  │  SSE client,    │  │  Page context │  │
│  │  Zustand store │  │  session mgr    │  │  (DOM, sel.)  │  │
│  └────────────────┘  └─────────────────┘  └───────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              ↕  HTTP + SSE  (localhost:PORT)
┌──────────────────────────────────────────────────────────────┐
│  Go Backend (single binary, runs as local daemon)            │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  HTTP Server (chi/echo)                              │    │
│  │  ├─ /api/sessions    (CRUD)                          │    │
│  │  ├─ /api/sessions/{id}/messages   (POST + SSE)       │    │
│  │  ├─ /api/sessions/{id}/response-stream (SSE resume)  │    │
│  │  ├─ /api/sessions/{id}/response-status               │    │
│  │  └─ /api/health, /api/auth                           │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  CopilotService (orchestrator)                       │    │
│  │  ├─ mainClient: list/metadata ops                    │    │
│  │  ├─ sessionClients: map[sid]*SessionClient (per-CWD) │    │
│  │  └─ idle GC goroutine (10-min TTL)                   │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  SessionClient   →   EventProcessor   →  ResponseBuf │    │
│  │  (per session)       (SDK→SSE xlator)    (resumable) │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Storage (BoltDB or filesystem JSON in ~/.copilot-ext)│   │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                              ↕  JSON-RPC over stdio
                ┌──────────────────────────────┐
                │  copilot CLI subprocess(es)  │
                └──────────────────────────────┘
```

---

## Mapping: copilot-console → New Project

| copilot-console (Python) | This project (Go + JS) | Notes |
|---|---|---|
| FastAPI + uvicorn | `net/http` + `chi` router | Single static binary |
| `asyncio.Task` background agent | `go func() { ... }` goroutine | Survives client disconnect |
| `asyncio.Queue` event queue | buffered `chan Event` | Backpressure: drop-oldest |
| `asyncio.Event` for buffer signal | `sync.Cond` or `chan struct{}` | Wake SSE writer on new data |
| `EventSourceResponse` (sse-starlette) | `http.Flusher` writing `data:`/`event:` lines | Keep-alive + heartbeat |
| `ResponseBuffer` (in-memory, 5-min TTL) | `ResponseBuffer` struct + RWMutex | Same semantics, same TTL |
| `CopilotService` + `SessionClient` | identical names, idiomatic Go | Same lifecycle |
| `EventProcessor` (SDK→SSE) | identical | Same event-name vocabulary |
| `~/.copilot-console/sessions/*.json` | `~/.copilot-ext/sessions/*.json` (or BoltDB) | Same schema |
| React + Vite + Zustand + Tailwind | React + Vite + Zustand + Tailwind | Side-panel build target |
| `parseSSEStream()` util | identical | EventSource API or fetch+ReadableStream |
| Delta batching (50 ms) | identical | `DELTA_BATCH_MS = 50` |
| `name_set` flag, auto-naming | identical | Mirror exactly |
| Elicitation/ask_user via futures | per-request `chan Result` | Same UX (modal in panel) |

---

## Component Breakdown

### A. Go Backend (`backend/`)

```
backend/
├── cmd/copilot-ext/main.go        # entry: flags, lifecycle, HTTP listen
├── internal/
│   ├── config/                    # paths, defaults, env
│   ├── server/
│   │   ├── server.go              # chi router wiring
│   │   ├── middleware/auth.go     # bearer-token (extension ↔ daemon)
│   │   ├── middleware/cors.go     # allow chrome-extension://<id>
│   │   └── sse/sse.go             # SSE writer helper (event/data/id/retry)
│   ├── routers/
│   │   ├── sessions.go            # POST/GET/DELETE + messages + stream
│   │   ├── models.go              # list models
│   │   ├── health.go
│   │   └── auth.go                # token issue/check
│   ├── services/
│   │   ├── copilot_service.go     # orchestrator (main + per-session)
│   │   ├── session_client.go      # wraps one CLI subprocess
│   │   ├── event_processor.go     # SDK event → SSE event
│   │   ├── response_buffer.go     # ordered_events + cond signaling
│   │   ├── elicitation.go         # pending request map + channels
│   │   └── storage.go             # session metadata persistence
│   ├── sdk/                       # Go wrapper around copilot CLI
│   │   ├── client.go              # spawn/stop subprocess, JSON-RPC framing
│   │   ├── session.go             # send_message, set_mode, set_model
│   │   ├── events.go              # typed SDK event structs
│   │   └── rpc.go                 # request/response correlator
│   └── models/                    # Session, Message, Step, Usage
├── go.mod
└── Makefile
```

**Good news:** The official Go SDK exists at **`github.com/github/copilot-sdk/go`** (`go get github.com/github/copilot-sdk/go`). API matches the Python SDK closely:

```go
client := copilot.NewClient(nil)
client.Start(ctx)
defer client.Stop()

session, _ := client.CreateSession(ctx, &copilot.SessionConfig{
    Model: "gpt-4.1",
    OnPermissionRequest: copilot.PermissionHandler.ApproveAll,
})
session.On(func(event copilot.SessionEvent) {
    if d, ok := event.Data.(*copilot.AssistantMessageDeltaData); ok { ... }
})
session.Send(copilot.MessageOptions{Prompt: "Hello"})
```

Available SDK surface (relevant subset):
- **Client:** `Start`, `Stop`, `CreateSession`, `ResumeSession`, `ListSessions`, `ListModels`, `DeleteSession`, `GetSessionMetadata`, `GetAuthStatus`, `On`/`OnEventType` (lifecycle).
- **Session events:** `AssistantMessageData`, `AssistantMessageDeltaData`, `AssistantReasoningData`, `AssistantReasoningDeltaData`, `AssistantTurnStartData`/`TurnEndData`, `AssistantUsageData`, `CapabilitiesChangedData`, plus tool/command events.
- **CLI requirement:** Unlike the Node/Python SDKs, the Go SDK does **not bundle** the CLI — `copilot` must be on PATH (already installed at `/home/shresth/.local/bin/copilot`).

This eliminates the protocol-research phase entirely. We focus on **wrapping** the SDK with our service layer (mirrors `SessionClient` / `EventProcessor` from copilot-console).

### B. Chrome Extension (`extension/`)

```
extension/
├── manifest.json                  # MV3, side_panel, permissions
├── public/icons/
├── src/
│   ├── background/
│   │   ├── service_worker.ts      # opens side panel, manages tab events
│   │   └── api.ts                 # fetch wrapper, token storage
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatPane.tsx       # message list + input
│   │   │   ├── Message.tsx        # markdown + syntax + steps
│   │   │   ├── StreamingMessage.tsx
│   │   │   ├── ElicitationModal.tsx
│   │   │   ├── SessionList.tsx
│   │   │   └── PageContextChip.tsx # shows current URL/title/selection
│   │   ├── stores/
│   │   │   ├── sessionStore.ts
│   │   │   ├── chatStore.ts       # delta batching, streaming state
│   │   │   └── settingsStore.ts
│   │   ├── api/
│   │   │   ├── client.ts          # base URL, auth header
│   │   │   ├── sessions.ts
│   │   │   └── stream.ts          # fetch+ReadableStream SSE parser
│   │   └── utils/
│   │       ├── sseParser.ts
│   │       └── sseConstants.ts
│   ├── content/
│   │   └── content_script.ts      # captures selection / DOM / page meta
│   └── shared/
│       ├── types.ts
│       └── messages.ts            # chrome.runtime message protocol
├── vite.config.ts                 # @crxjs/vite-plugin
├── tsconfig.json
└── package.json
```

### C. Browser-Extension–Specific Additions

These don't exist in copilot-console and are unique to a browser context:

1. **Page Context Provider** — content script captures `{ url, title, selectionText, h1s }` and injects as a system prefix or attachment when the user sends a message ("Use this page as context").
2. **Side Panel lifecycle** — service worker calls `chrome.sidePanel.setOptions({ tabId, path })` per tab; chat state must survive panel closes (covered by `ResponseBuffer`).
3. **Local daemon discovery** — extension probes `http://127.0.0.1:PORT/api/health` on a fixed/known port; if down, shows "Start the local daemon" instructions.
4. **Auth between extension and daemon** — bearer token stored in `chrome.storage.local`; daemon prints token on first start. Prevents random websites (or other extensions) from talking to the local daemon via CORS.
5. **CORS** — daemon must allow `Origin: chrome-extension://<extension-id>` only (configurable list).

---

## Data & Event Contracts (Mirror copilot-console)

**Session JSON** (persisted at `~/.copilot-ext/sessions/{id}.json`):
```json
{
  "id": "uuid",
  "name": "string", "name_set": false,
  "model": "gpt-4.1",
  "cwd": "/home/user",
  "system_message": "string",
  "mcp_servers": {}, "tools": [],
  "created_at": "iso8601", "updated_at": "iso8601"
}
```

**SSE event vocabulary** (kept identical to upstream):
`delta`, `step`, `usage_info`, `turn_done`, `done`, `error`,
`title_changed`, `mode_changed`, `elicitation`, `ask_user`, `pending_messages`.

**Resume contract:**
`GET /api/sessions/{id}/response-stream?from_chunk=N&from_step=M`
Returns 404 if buffer expired (>5 min after completion).

---

## Implementation Phases (Todos)

Tracked in SQL. High-level grouping:

- **P1 — SDK familiarisation**: ✅ done — `cmd/spike` validated 15 event types, see `backend/docs/sdk-events.md`.
- **P2 — Backend services**: ✅ done — `ResponseBuffer`, `EventProcessor`, `SessionClient`, `CopilotService`, `Storage`. Integration test `TestRoundTrip` proves end-to-end (real CLI → assembled content `"OK"` in 10s).
- **P3 — Backend HTTP** *(next)*: routers, SSE writer, auth/CORS middleware, health.
- **P4 — Extension scaffold**: MV3 manifest, vite + crxjs, side panel host page, service worker.
- **P5 — Extension UI**: chat components, stores, SSE parser, delta batching.
- **P6 — Browser-specific features**: page-context content script, side panel lifecycle, daemon discovery, token onboarding.
- **P7 — Resilience**: disconnect/resume, idle GC, error UX.
- **P8 — Packaging**: distribute Go binary (per-OS) + Chrome Web Store package, autostart docs.

---

## Open Questions (Confirm Before Build)

1. ~~SDK strategy~~ — **resolved**: use official `github.com/github/copilot-sdk/go` (CLI must be on PATH; already installed at `~/.local/bin/copilot`).
2. **Session model** — one chat per browser tab, one global chat, or a session list (like copilot-console)? *Recommendation: session list with optional "auto-attach to current tab" mode.*
3. **Page context default** — auto-include URL/title every send, or opt-in via a chip? *Recommendation: opt-in chip (avoids token bloat & privacy surprises).*
4. **CWD per session** — fixed to `~`, configurable per session, or pulled from a workspace mapping? *Recommendation: configurable per session, default `~`.*
5. **Multi-window** — single side-panel state shared across windows, or per-window? *Recommendation: shared (simpler).*

---

## Notes / Considerations

- Keep the SSE event vocabulary byte-compatible with copilot-console so its frontend code can be lifted with minimal changes (saves weeks).
- The `ResponseBuffer` is the linchpin for side-panel UX — closing the panel must NOT cancel the agent. Verify this end-to-end early.
- Go's `context.Context` should propagate to subprocess writes for clean shutdown; goroutines per session must exit on `service.Stop()`.
- Don't ship secrets in the extension; rely on the local daemon's bearer token only.
- Plan for Windows: subprocess handling, path semantics, and the daemon as a Windows service (or a tray app) deserve their own milestone.
