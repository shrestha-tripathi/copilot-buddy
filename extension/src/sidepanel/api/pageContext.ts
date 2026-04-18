/**
 * pageContext — fetches a snapshot of the currently active tab by
 * injecting a short function via chrome.scripting.executeScript. This
 * works on any http/https page without relying on a persistent content
 * script, and returns `null` gracefully on restricted pages
 * (chrome://, chromewebstore, etc.).
 */

export interface PageContext {
  url: string;
  title: string;
  selection: string;
  textExcerpt?: string;
  capturedAt: number;
}

function injected() {
  const sel = window.getSelection()?.toString() ?? "";
  // Grab the readable text of the page as a best-effort fallback when
  // the user hasn't selected anything. Capped to 12 KB to keep prompts
  // tight.
  const bodyText = (document.body?.innerText ?? "").trim();
  return {
    url: location.href,
    title: document.title,
    selection: sel.slice(0, 8000),
    textExcerpt: sel ? "" : bodyText.slice(0, 12000),
    capturedAt: Date.now(),
  };
}

export async function captureActiveTabContext(): Promise<PageContext | null> {
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) {
    return null;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return null;
    // Restricted URLs — chrome://, chrome-extension://, web store — can't
    // be scripted. Surface a friendlier null.
    if (
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:") ||
      tab.url.includes("chromewebstore.google.com")
    ) {
      return null;
    }
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func: injected,
    });
    return (result?.result as PageContext | undefined) ?? null;
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
  } else if (ctx.textExcerpt) {
    lines.push("", "Page excerpt:", "```", ctx.textExcerpt, "```");
  }
  return lines.join("\n");
}
