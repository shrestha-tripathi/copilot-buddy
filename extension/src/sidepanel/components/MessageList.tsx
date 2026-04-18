import { useEffect, useRef } from "react";
import { useChatStore, type Message } from "../stores/chatStore";

interface Props {
  sessionId: string | null;
}

export function MessageList({ sessionId }: Props) {
  const messages = useChatStore((s) =>
    sessionId ? s.messagesPerSession[sessionId] ?? [] : [],
  );
  const streaming = useChatStore((s) => s.getStreaming(sessionId));
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streaming.content, streaming.isStreaming]);

  if (!sessionId) {
    return (
      <div className="cb-empty">
        Select a session from the list above, or create a new one to start chatting.
      </div>
    );
  }

  if (messages.length === 0 && !streaming.isStreaming) {
    return (
      <div className="cb-empty">
        No messages yet. Say hello below — try "summarise this page" with page context enabled.
      </div>
    );
  }

  return (
    <div className="cb-messages">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {streaming.isStreaming && (
        <div className="cb-msg-row">
          <div className="cb-avatar cb-avatar--assistant" aria-hidden>✦</div>
          <div className="cb-msg cb-msg--streaming">
            {streaming.steps.map((s, i) => (
              <div key={i} className="cb-step">
                <strong>{s.title}</strong>
                {s.detail ? <pre>{s.detail}</pre> : null}
              </div>
            ))}
            {streaming.content ? (
              <div className="cb-msg__content">
                {streaming.content}
                <span className="cb-cursor" />
              </div>
            ) : (
              <div className="cb-msg__content"><em>thinking</em></div>
            )}
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`cb-msg-row ${isUser ? "cb-msg-row--user" : ""}`}>
      <div
        className={`cb-avatar ${isUser ? "cb-avatar--user" : "cb-avatar--assistant"}`}
        aria-hidden
      >
        {isUser ? "You" : "✦"}
      </div>
      <div className={`cb-msg cb-msg--${message.role}`}>
        {message.steps?.map((s, i) => (
          <div key={i} className="cb-step">
            <strong>{s.title}</strong>
            {s.detail ? <pre>{s.detail}</pre> : null}
          </div>
        ))}
        <div className="cb-msg__content">{message.content}</div>
      </div>
    </div>
  );
}
