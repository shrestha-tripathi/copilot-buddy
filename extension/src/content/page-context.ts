/**
 * Content script — captures lightweight page context (URL, title, selection)
 * that the side panel can request to ground Copilot prompts.
 *
 * Stays passive: only responds to messages from the extension; no DOM mutation.
 */

type ContextRequest = { type: "copilot-buddy/get-page-context" };

interface PageContext {
  url: string;
  title: string;
  selection: string;
  capturedAt: number;
}

function snapshot(): PageContext {
  const sel = window.getSelection()?.toString() ?? "";
  return {
    url: location.href,
    title: document.title,
    selection: sel.slice(0, 8000),
    capturedAt: Date.now(),
  };
}

chrome.runtime.onMessage.addListener(
  (msg: ContextRequest, _sender, sendResponse) => {
    if (msg?.type === "copilot-buddy/get-page-context") {
      sendResponse(snapshot());
      return true;
    }
    return false;
  },
);

export {};
