import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { useApi } from "../api/useApi";
import { sessionsApi } from "@/shared/api/sessions";
import { useSessionStore } from "../stores/sessionStore";
import { useChatStore } from "../stores/chatStore";
import { sendMessage, resumeStream } from "../api/messages";
import { formatPageContext, type PageContext } from "../api/pageContext";
import { MessageList } from "./MessageList";
import { ChatInput, type Attachment } from "./ChatInput";
import { ElicitationModal } from "./ElicitationModal";
import { AskUserModal } from "./AskUserModal";
import { Button } from "../ui/Button";

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
  const streaming = useChatStore((s) => s.getStreaming(activeId));
  const [error, setError] = useState<string | null>(null);
  const [includeContext, setIncludeContext] = useState(false);
  const inflight = useRef<AbortController | null>(null);

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
            onError: setError,
          }).catch((err) => {
            if ((err as Error).name !== "AbortError") setError((err as Error).message);
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      inflight.current?.abort();
      inflight.current = null;
    };
  }, [activeId, api, daemonOnline]);

  const handleSubmit = async (
    text: string,
    extras: { attachments: Attachment[]; pageContext: PageContext | null },
  ) => {
    if (!activeId) return;
    setError(null);

    const parts: string[] = [];
    if (includeContext && extras.pageContext) {
      parts.push(formatPageContext(extras.pageContext));
    }
    for (const a of extras.attachments) {
      if (a.kind === "text") {
        parts.push(`<!-- attachment: ${a.name} (${a.size} bytes) -->\n\`\`\`\n${a.content}\n\`\`\``);
      } else {
        parts.push(
          `<!-- attached image: ${a.name} (${a.size} bytes) — not inlined; describe if relevant -->`,
        );
      }
    }
    if (text) parts.push(text);
    const prompt = parts.join("\n\n").trim();
    if (!prompt) return;

    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try {
      await sendMessage(api, activeId, prompt, {
        signal: ctrl.signal,
        onError: (msg) => {
          setError(msg);
          toast.error(msg);
        },
        onDone: (payload) => {
          if (payload.session_name) {
            const cur = sessions.find((s) => s.id === activeId);
            if (cur && !cur.name) upsert({ ...cur, name: payload.session_name });
          }
        },
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
        toast.error((err as Error).message);
      }
    }
  };

  const stopStreaming = () => {
    inflight.current?.abort();
    inflight.current = null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-1 text-[11px] text-[var(--color-text-dim)]">
        <div className="flex items-center gap-2">
          {streaming.isStreaming && (
            <span className="inline-flex items-center gap-1.5 text-[var(--color-primary)]">
              <span className="cb-spinner" /> streaming…
            </span>
          )}
          {!streaming.isStreaming && error && (
            <span className="inline-flex items-center gap-1.5 text-[var(--color-danger)]">
              <AlertCircle className="h-3 w-3" /> {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {usage && (
            <span title={`${usage.messagesLength} messages in context`}>
              {Math.round(usage.currentTokens)}/{Math.round(usage.tokenLimit)} tok
            </span>
          )}
          {streaming.isStreaming && (
            <Button size="sm" variant="outline" onClick={stopStreaming}>
              Stop
            </Button>
          )}
        </div>
      </div>
      <MessageList sessionId={activeId} />
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
              toast.error((e as Error).message);
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
              toast.error((e as Error).message);
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
              toast.error((e as Error).message);
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
              toast.error((e as Error).message);
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
              toast.error((e as Error).message);
            }
            setPendingAskUser(activeId, null);
          }}
        />
      )}
    </div>
  );
}
