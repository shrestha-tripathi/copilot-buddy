import { useEffect, useRef, useState } from "react";
import { useApi } from "../api/useApi";
import { sessionsApi } from "@/shared/api/sessions";
import { useSessionStore } from "../stores/sessionStore";
import { useChatStore } from "../stores/chatStore";
import { sendMessage, resumeStream } from "../api/messages";
import { captureActiveTabContext, formatPageContext } from "../api/pageContext";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ElicitationModal } from "./ElicitationModal";
import { AskUserModal } from "./AskUserModal";

interface Props {
  daemonOnline: boolean;
}

export function ChatPane({ daemonOnline }: Props) {
  const api = useApi();
  const activeId = useSessionStore((s) => s.activeId);
  const upsert = useSessionStore((s) => s.upsert);
  const sessions = useSessionStore((s) => s.sessions);
  const usage = useChatStore((s) => (activeId ? s.usagePerSession[activeId] : null));
  const pendingElicitation = useChatStore((s) =>
    activeId ? s.pendingElicitation[activeId] : null,
  );
  const pendingAskUser = useChatStore((s) =>
    activeId ? s.pendingAskUser[activeId] : null,
  );
  const setPendingElicitation = useChatStore((s) => s.setPendingElicitation);
  const setPendingAskUser = useChatStore((s) => s.setPendingAskUser);
  const [error, setError] = useState<string | null>(null);
  const [includeContext, setIncludeContext] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  // On session switch, check whether the daemon is mid-turn — if so, resume
  // the SSE stream so we keep streaming any in-flight response.
  useEffect(() => {
    if (!activeId || !daemonOnline) return;
    let cancelled = false;
    sessionsApi
      .responseStatus(api, activeId)
      .then((status) => {
        if (cancelled) return;
        if (status.active) {
          const ctrl = new AbortController();
          inflight.current = ctrl;
          resumeStream(api, activeId, status.events ?? 0, {
            signal: ctrl.signal,
            onError: (msg) => setError(msg),
          }).catch((err) => {
            if ((err as Error).name !== "AbortError") setError((err as Error).message);
          });
        }
      })
      .catch(() => {
        /* status endpoint failures are non-fatal */
      });
    return () => {
      cancelled = true;
      inflight.current?.abort();
      inflight.current = null;
    };
  }, [activeId, api, daemonOnline]);

  const handleSubmit = async (text: string) => {
    if (!activeId) return;
    setError(null);

    let prompt = text;
    if (includeContext) {
      const ctx = await captureActiveTabContext();
      if (ctx) prompt = `${formatPageContext(ctx)}\n\n${text}`;
    }

    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try {
      await sendMessage(api, activeId, prompt, {
        signal: ctrl.signal,
        onError: setError,
        onDone: (payload) => {
          if (payload.session_name) {
            const cur = sessions.find((s) => s.id === activeId);
            if (cur) upsert({ ...cur, name: payload.session_name });
          }
        },
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    }
  };

  return (
    <div className="cb-chat">
      {usage && (
        <div className="cb-usage">
          {Math.round(usage.currentTokens)} / {Math.round(usage.tokenLimit)} tokens
          ({usage.messagesLength} msgs)
        </div>
      )}
      <MessageList sessionId={activeId} />
      {error && <div className="cb-error">{error}</div>}
      <ChatInput
        disabled={!activeId || !daemonOnline}
        includeContext={includeContext}
        onToggleContext={setIncludeContext}
        onSubmit={handleSubmit}
      />
      {activeId && pendingElicitation && (
        <ElicitationModal
          request={pendingElicitation}
          onAccept={async (content) => {
            try {
              await sessionsApi.respondElicitation(api, activeId, {
                request_id: pendingElicitation.requestId,
                action: "accept",
                content,
              });
            } catch (e) {
              setError((e as Error).message);
            }
            setPendingElicitation(activeId, null);
          }}
          onDecline={async () => {
            try {
              await sessionsApi.respondElicitation(api, activeId, {
                request_id: pendingElicitation.requestId,
                action: "decline",
              });
            } catch (e) {
              setError((e as Error).message);
            }
            setPendingElicitation(activeId, null);
          }}
          onCancel={async () => {
            try {
              await sessionsApi.respondElicitation(api, activeId, {
                request_id: pendingElicitation.requestId,
                action: "cancel",
              });
            } catch (e) {
              setError((e as Error).message);
            }
            setPendingElicitation(activeId, null);
          }}
        />
      )}
      {activeId && pendingAskUser && (
        <AskUserModal
          request={pendingAskUser}
          onSubmit={async (answer, wasFreeform) => {
            try {
              await sessionsApi.respondUserInput(api, activeId, {
                request_id: pendingAskUser.requestId,
                answer,
                was_freeform: wasFreeform,
              });
            } catch (e) {
              setError((e as Error).message);
            }
            setPendingAskUser(activeId, null);
          }}
          onCancel={async () => {
            try {
              await sessionsApi.respondUserInput(api, activeId, {
                request_id: pendingAskUser.requestId,
                answer: "",
                was_freeform: false,
              });
            } catch (e) {
              setError((e as Error).message);
            }
            setPendingAskUser(activeId, null);
          }}
        />
      )}
    </div>
  );
}
