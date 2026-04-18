/**
 * sendMessage — POSTs to /api/sessions/{id}/messages and dispatches every
 * SSE event into the chat store. Returns when the stream ends.
 *
 * resumeStream — GETs /api/sessions/{id}/response-stream?from=N to pick up
 * an in-flight response after a side-panel reopen.
 */

import { SSE_EVENTS } from "@/shared/api/events";
import type { Api } from "@/shared/api/client";
import { useChatStore, type Step, type UsageInfo } from "../stores/chatStore";

interface DonePayload {
  content_length?: number;
  session_name?: string;
  updated_at?: string;
}

interface DispatchOpts {
  onDone?: (payload: DonePayload) => void;
  onError?: (msg: string) => void;
  onTitleChanged?: (title: string) => void;
}

function buildEventDispatcher(
  sessionId: string,
  opts: DispatchOpts,
): (evt: string, data: unknown) => void {
  const chat = useChatStore.getState();
  let assistantMsgId = "";

  return (evt, data) => {
    const d = data as Record<string, unknown>;
    switch (evt) {
      case SSE_EVENTS.DELTA:
        if (typeof d.content === "string") chat.appendDelta(sessionId, d.content);
        break;
      case SSE_EVENTS.STEP:
        if (typeof d.title === "string") {
          chat.addStep(sessionId, {
            title: d.title,
            detail: typeof d.detail === "string" ? d.detail : undefined,
          } as Step);
        }
        break;
      case SSE_EVENTS.USAGE_INFO:
        chat.setUsage(sessionId, {
          tokenLimit: Number(d.tokenLimit ?? 0),
          currentTokens: Number(d.currentTokens ?? 0),
          messagesLength: Number(d.messagesLength ?? 0),
        } satisfies UsageInfo);
        break;
      case SSE_EVENTS.TURN_DONE:
        assistantMsgId = String(d.message_id ?? d.messageId ?? "");
        chat.finalizeAssistantMessage(sessionId, assistantMsgId);
        break;
      case SSE_EVENTS.TITLE_CHANGED:
        if (typeof d.title === "string") opts.onTitleChanged?.(d.title);
        break;
      case SSE_EVENTS.DONE:
        // Fallback finalizer — if the server didn't emit turn_done
        // (older daemons), promote whatever's in streaming state to a
        // persisted assistant message here. finalize is idempotent and
        // no-ops on empty content.
        chat.finalizeAssistantMessage(sessionId, assistantMsgId);
        chat.setStreaming(sessionId, false);
        opts.onDone?.(d as DonePayload);
        break;
      case SSE_EVENTS.ERROR:
        chat.setStreaming(sessionId, false);
        opts.onError?.(String(d.error ?? "unknown error"));
        break;
      case SSE_EVENTS.ELICITATION:
        if (typeof d.request_id === "string") {
          chat.setPendingElicitation(sessionId, {
            requestId: d.request_id,
            message: typeof d.message === "string" ? d.message : "",
            requestedSchema:
              (d.requested_schema as Record<string, unknown> | undefined) ?? null,
            mode: typeof d.mode === "string" ? d.mode : undefined,
            source:
              typeof d.elicitation_source === "string" ? d.elicitation_source : undefined,
            url: typeof d.url === "string" ? d.url : undefined,
          });
        }
        break;
      case SSE_EVENTS.ASK_USER:
        if (typeof d.request_id === "string") {
          chat.setPendingAskUser(sessionId, {
            requestId: d.request_id,
            question: typeof d.question === "string" ? d.question : "",
            choices: Array.isArray(d.choices) ? (d.choices as string[]) : [],
            allowFreeform: d.allow_freeform !== false,
          });
        }
        break;
      default:
        // mode_changed, pending_messages — currently unused.
        break;
    }
  };
}

import type { DisplayAttachment } from "../stores/chatStore";

export type { DisplayAttachment };

export interface WireAttachment {
  kind: "blob" | "text";
  name: string;
  mime_type?: string;
  data?: string; // base64
  text?: string;
}

export async function sendMessage(
  api: Api,
  sessionId: string,
  content: string,
  opts: DispatchOpts & {
    isNewSession?: boolean;
    signal?: AbortSignal;
    attachments?: WireAttachment[];
    displayAttachments?: DisplayAttachment[];
  } = {},
): Promise<void> {
  const chat = useChatStore.getState();
  // Reset any leftover streaming state from a prior turn so we don't
  // render stale content while the server warms up.
  chat.resetStreaming(sessionId);
  chat.addMessage(sessionId, {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: Date.now(),
    attachments: opts.displayAttachments,
  });
  chat.setStreaming(sessionId, true);

  await api.stream(`/api/sessions/${sessionId}/messages`, buildEventDispatcher(sessionId, opts), {
    method: "POST",
    body: {
      content,
      is_new_session: !!opts.isNewSession,
      attachments: opts.attachments ?? [],
    },
    signal: opts.signal,
  });
}

export async function resumeStream(
  api: Api,
  sessionId: string,
  fromIndex: number,
  opts: DispatchOpts & { signal?: AbortSignal } = {},
): Promise<void> {
  useChatStore.getState().setStreaming(sessionId, true);
  await api.stream(
    `/api/sessions/${sessionId}/response-stream?from=${fromIndex}`,
    buildEventDispatcher(sessionId, opts),
    { method: "GET", signal: opts.signal },
  );
}
