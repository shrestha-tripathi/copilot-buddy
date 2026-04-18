/**
 * pageContext — fetches a snapshot of the currently active tab via the
 * content script (`src/content/page-context.ts`).
 *
 * Returns `null` if we can't reach the tab (e.g., Chrome internal pages,
 * Web Store, or the tab has no content script injected).
 */

export interface PageContext {
  url: string;
  title: string;
  selection: string;
  capturedAt: number;
}

export async function captureActiveTabContext(): Promise<PageContext | null> {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return null;
    const ctx = (await chrome.tabs.sendMessage(tab.id, {
      type: "copilot-buddy/get-page-context",
    })) as PageContext | undefined;
    return ctx ?? null;
  } catch (err) {
    console.warn("[copilot-buddy] page-context capture failed", err);
    return null;
  }
}

/** Render a page-context snapshot as a markdown block to prepend to a prompt. */
export function formatPageContext(ctx: PageContext): string {
  const lines = [
    "<!-- page context (captured by Copilot Buddy) -->",
    `URL: ${ctx.url}`,
    `Title: ${ctx.title}`,
  ];
  if (ctx.selection) {
    lines.push("", "Selected text:", "```", ctx.selection, "```");
  }
  return lines.join("\n");
}
