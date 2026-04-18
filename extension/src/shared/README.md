# shared/

Code intended to be reused across `sidepanel/`, `background/`, and `content/`
contexts. Keep this folder dependency-light — anything imported here ends up in
both the service worker bundle and the panel bundle.

Planned modules (P5):

- `api/client.ts` — typed fetch wrapper + bearer auth handling
- `api/sse.ts` — SSE parser ported from copilot-console
- `api/events.ts` — event-name constants mirroring backend SSE vocabulary
