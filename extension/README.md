# Copilot Buddy — Chrome Extension

Side-panel MV3 extension that talks to the local Go daemon (`../backend`).

## Stack

- Vite + React 18 + TypeScript
- `@crxjs/vite-plugin` for MV3 bundling and HMR
- Zustand (added in P5) for chat state

## Layout

```
src/
  background/     service worker (opens side panel, messaging hub)
  content/        page-context content script (URL, title, selection)
  sidepanel/      React UI for the side panel
  shared/         cross-context utilities (api client, SSE parser — P5)
public/icons/     extension icons (placeholder until P8)
manifest.config.ts  MV3 manifest, sourced into Vite via @crxjs
```

## Develop

```bash
cd extension
npm install
npm run dev          # Vite dev server with CRX HMR
```

Then in Chrome: **chrome://extensions** → enable Developer mode → **Load unpacked** → point at `extension/dist` (after a build) or follow CRXJS HMR instructions for `dev`.

## Build

```bash
npm run build
```

Output lands in `dist/` ready to load unpacked or zip for the Web Store.

## Daemon discovery

The panel probes `http://127.0.0.1:8770/api/health` on mount. Override the
daemon URL via the options page (added in P6) once token onboarding lands.
