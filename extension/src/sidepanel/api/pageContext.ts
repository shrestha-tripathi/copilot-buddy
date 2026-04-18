/**
 * pageContext — fetches a snapshot of the currently active tab by
 * injecting a short function via chrome.scripting.executeScript.
 *
 * Permission model
 * ----------------
 * `activeTab` only grants scripting rights to the tab the user *invoked*
 * the extension on (clicked the action icon / used a shortcut). Because
 * the side panel stays open across tab switches and reloads, that grant
 * is usually gone by the time the user asks for page context.
 *
 * To cover the common case, we declare `<all_urls>` under
 * `optional_host_permissions` and request it at runtime the first time
 * the user enables page-context. Chrome shows a single permission
 * prompt and remembers the decision — no install-time scary warning.
 */

export interface PageContext {
  url: string;
  title: string;
  selection: string;
  textExcerpt?: string;
  capturedAt: number;
}

export type CaptureFailure =
  | { kind: "restricted"; url?: string }
  | { kind: "no-tab" }
  | { kind: "permission-required"; origin: string }
  | { kind: "permission-denied"; origin: string }
  | { kind: "error"; message: string };

export type CaptureResult =
  | { ok: true; context: PageContext }
  | { ok: false; reason: CaptureFailure };

function injected() {
  const sel = window.getSelection()?.toString() ?? "";
  const bodyText = (document.body?.innerText ?? "").trim();
  return {
    url: location.href,
    title: document.title,
    selection: sel.slice(0, 8000),
    textExcerpt: sel ? "" : bodyText.slice(0, 12000),
    capturedAt: Date.now(),
  };
}

function isRestricted(url: string | undefined): boolean {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools://") ||
    url.startsWith("view-source:") ||
    url.includes("chromewebstore.google.com") ||
    url.includes("chrome.google.com/webstore")
  );
}

/** Build a permissions-API origin pattern (`https://github.com/*`) from a tab URL. */
function originPattern(tabUrl: string): string | null {
  try {
    const u = new URL(tabUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

async function hasPermission(origin: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

/** Prompt the user for `<all_urls>` access. Must be called from a user gesture. */
export async function requestAllUrlsPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: ["*://*/*"] });
  } catch (err) {
    console.warn("[copilot-buddy] permissions.request failed", err);
    return false;
  }
}

export async function captureActiveTabContext(): Promise<CaptureResult> {
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) {
    return { ok: false, reason: { kind: "error", message: "chrome APIs unavailable" } };
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return { ok: false, reason: { kind: "no-tab" } };
    if (isRestricted(tab.url)) {
      return { ok: false, reason: { kind: "restricted", url: tab.url } };
    }

    const origin = originPattern(tab.url!);
    // If we haven't been granted this origin yet, surface a
    // permission-required state so the UI can render a "Grant access"
    // affordance. We don't request here because permissions.request
    // must be tied to a user gesture.
    if (origin && !(await hasPermission(origin)) && !(await hasPermission("*://*/*"))) {
      return { ok: false, reason: { kind: "permission-required", origin } };
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      func: injected,
    });
    const context = (result?.result as PageContext | undefined) ?? null;
    if (!context) {
      return { ok: false, reason: { kind: "error", message: "empty capture" } };
    }
    return { ok: true, context };
  } catch (err) {
    const message = (err as Error).message || String(err);
    // Chrome returns this exact phrasing when the host permission is missing.
    if (/Cannot access contents of|Extension manifest must request permission/i.test(message)) {
      return {
        ok: false,
        reason: { kind: "permission-denied", origin: "*://*/*" },
      };
    }
    console.warn("[copilot-buddy] page-context capture failed", err);
    return { ok: false, reason: { kind: "error", message } };
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
