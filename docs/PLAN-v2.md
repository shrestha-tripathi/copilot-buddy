# Copilot Buddy v2 — UX & Feature Plan

## Goals (user ask)
1. Snappy, CLI-quality streaming (no perceptual lag; chunks render as they arrive).
2. First-class page-context integration (selection, URL, title, optional full text).
3. UI controls for backend knobs: model, reasoning effort, system message.
4. Create/manage **custom agents** from the panel.
5. Configure **MCP servers** (local & remote) from the panel.
6. Polished, fluid UI using a popular open-source component library.

## Stack choice
- **Tailwind CSS v4** + **Radix UI primitives** + **lucide-react** icons
  (a.k.a. the shadcn/ui stack: tiny bundle, beautiful, accessible).
- **react-markdown + shiki** for rendered markdown & syntax highlighting in
  assistant messages.
- Keep Zustand for state, Vite for build.

## Phase A — Backend plumbing (Go)
- Extend `models.Session` + storage schema with:
  `reasoning_effort`, `mcp_servers` (JSON), `agent`, `custom_agents` (JSON).
- Wire into `SessionConfig` in `session_client.go`.
- Add new endpoints:
  - `PATCH /sessions/{id}` — update model / reasoning / system / agent / mcp.
  - `GET /agents` + `POST /agents` + `DELETE /agents/{name}` — global user-level agents.
  - `GET /mcp-servers` + `PUT /mcp-servers` — global MCP catalogue.
- Persist agents & MCP catalogue to `~/.copilot-buddy/agents.json` and `mcp.json`.

## Phase B — Streaming perf
- Reduce coalesce window from 50 ms → 16 ms (one frame) for snappier feel.
- Use `requestAnimationFrame` for DOM updates instead of setTimeout.
- Render assistant markdown incrementally: parse on buffer flush, memoise per-message.

## Phase C — UI foundation
- Add Tailwind v4, configure for Chrome extension (preflight scoped).
- Install `@radix-ui/react-*` (dialog, select, switch, tabs, tooltip, scroll-area, dropdown-menu, slider).
- Add `lucide-react`, `react-markdown`, `shiki`, `clsx`, `tailwind-merge`.
- Port global CSS tokens into Tailwind theme.
- Build `ui/` primitives (Button, Input, Select, Dialog, Tabs, Tooltip, Switch, Slider).

## Phase D — Features wiring
- **Header**: brand + status dot + model selector (Select) + settings menu (DropdownMenu).
- **SettingsDrawer** (Dialog with Tabs):
  - *General* — base URL, token, reset.
  - *Model & Reasoning* — model select + reasoning-effort slider (dynamic from capability).
  - *System message* — textarea.
  - *Agents* — list with add/edit/delete (name, description, prompt, tools, MCPs).
  - *MCP Servers* — list with add/edit/delete (local stdio vs remote HTTP).
- **SessionPicker**: redesigned with session card, current-model badge.
- **MessageList**: markdown with code highlighting + copy button; animated step list
  (tool-calls, reasoning deltas collapsed by default); auto-scroll with "jump to latest".
- **ChatInput**: slash-commands (`/model`, `/agent`, `/clear`), page-context chip with
  editable preview, attach-selection toggle, Cmd+Enter to send.
- **PageContextChip**: shows URL/title, selection byte count, "include full page" switch.
- Toast notifications (sonner) for saves / errors.

## Phase E — Build & ship
- Run `npm run build`, `go build ./...`, `scripts/release.sh`.
- Update README screenshots section.
- Commit + push.

## Out of scope (for now)
- Client-side persistence of messages across panel open/close.
- Multi-tab sync.
- Keyboard command palette (cmdk) — nice-to-have, will add if time permits.
