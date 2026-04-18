import { useChatStore, type Message } from "../stores/chatStore";

interface Props {
  sessionId: string | null;
}

export function MessageList({ sessionId }: Props) {
  const messages = useChatStore((s) =>
    sessionId ? s.messagesPerSession[sessionId] ?? [] : [],
  );
  const streaming = useChatStore((s) => s.getStreaming(sessionId));

  if (!sessionId) {
    return <div className="cb-empty">Select or create a session to start chatting.</div>;
  }

  return (
    <div className="cb-messages">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {streaming.isStreaming && (
        <div className="cb-msg cb-msg--assistant cb-msg--streaming">
          {streaming.steps.map((s, i) => (
            <div key={i} className="cb-step">
              <strong>{s.title}</strong>
              {s.detail ? <pre>{s.detail}</pre> : null}
            </div>
          ))}
          {streaming.content || <em>thinking…</em>}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={`cb-msg cb-msg--${message.role}`}>
      {message.steps?.map((s, i) => (
        <div key={i} className="cb-step">
          <strong>{s.title}</strong>
          {s.detail ? <pre>{s.detail}</pre> : null}
        </div>
      ))}
      <div className="cb-msg__content">{message.content}</div>
    </div>
  );
}
