# copilot-buddy

Chrome side-panel extension + Go daemon that brings the GitHub Copilot agent to any webpage.

Architecture mirrors [copilot-console](https://github.com/sanchar10/copilot-console) but is reimplemented in Go (idiomatic concurrency: goroutines + channels) and adapted for the browser-extension context (page-aware, side panel UX).

## Layout

```
copilot-buddy/
├── backend/        # Go daemon — wraps github.com/github/copilot-sdk/go
│   ├── cmd/copilot-buddy/   # daemon entry
│   ├── cmd/spike/           # SDK familiarisation spike (P1)
│   └── internal/...         # server, services, storage
├── extension/      # Chrome MV3 extension (React + Vite + crxjs)
│   ├── src/background/      # service worker
│   ├── src/sidepanel/       # side panel UI
│   └── src/content/         # page-context capture
└── docs/
```

## Prerequisites

- **Go 1.24+**
- **Node.js 20+** (for the extension)
- **GitHub Copilot CLI** on PATH — `copilot --version`

## Quick start

### Run the SDK spike (P1)

```bash
cd backend
make spike
# or: COPILOT_BUDDY_PROMPT="hello" go run ./cmd/spike
```

The spike sends one prompt, prints every SDK event type to stdout, and dumps full JSON to `backend/docs/sdk-events.log`. Use the histogram + JSON to write `EventProcessor`.

### Daemon (stub for now)

```bash
cd backend
make run
```

### Extension (stub for now)

```bash
cd extension
npm install
npm run dev
```

## Plan

See `~/.copilot/session-state/.../plan.md` (saved during `/plan`) for the full implementation roadmap.
