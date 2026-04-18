/**
 * SSE stream parser — ported from copilot-console
 * (frontend/src/utils/sseParser.ts). We use fetch + ReadableStream rather
 * than EventSource because EventSource cannot send the Authorization header
 * required by the Copilot Buddy daemon.
 */

export type SSEEventHandler = (event: string, data: unknown) => void;

export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: SSEEventHandler,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        dispatchSSEBlock(block, onEvent);
      }
    }

    if (buffer.trim()) {
      dispatchSSEBlock(buffer, onEvent);
    }
  } finally {
    reader.releaseLock();
  }
}

function dispatchSSEBlock(block: string, onEvent: SSEEventHandler): void {
  const lines = block.split(/\r?\n/);
  let eventName = "";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.replace(/^event:\s?/, "").trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.replace(/^data:\s?/, ""));
    }
  }

  const eventData = dataLines.join("\n");
  if (!eventData) return;

  try {
    const data = JSON.parse(eventData);
    onEvent(eventName, data);
  } catch (err) {
    console.error("[copilot-buddy] failed to parse SSE data:", eventData, err);
  }
}
