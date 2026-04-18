import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, ChevronDown, ChevronRight, Copy, Sparkles, Terminal, User2 } from "lucide-react";
import { useChatStore, type Message, type Step } from "../stores/chatStore";
import { cn } from "../lib/cn";

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
  }, [messages.length, streaming.content, streaming.isStreaming, streaming.steps.length]);

  if (!sessionId) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-[12.5px] text-[var(--color-text-muted)]">
        Select a session above, or create a new one to start chatting.
      </div>
    );
  }

  if (messages.length === 0 && !streaming.isStreaming) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Sparkles className="h-6 w-6 text-[var(--color-primary)]" />
        <p className="text-[13px] font-medium">Ready when you are.</p>
        <p className="max-w-[260px] text-[11.5px] text-[var(--color-text-dim)]">
          Try "summarise this page" with page context enabled, or ask anything.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {streaming.isStreaming && (
        <StreamingBubble steps={streaming.steps} content={streaming.content} />
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function StreamingBubble({ steps, content }: { steps: Step[]; content: string }) {
  return (
    <div className="flex gap-2">
      <Avatar role="assistant" />
      <div className="min-w-0 flex-1 space-y-2">
        {steps.map((s, i) => (
          <StepCard key={i} step={s} />
        ))}
        {content ? (
          <div className="cb-prose rounded-xl bg-[var(--color-bg-elev)] px-3 py-2 text-[13px]">
            <Markdown text={content} />
            <span className="cb-cursor" />
          </div>
        ) : steps.length === 0 ? (
          <div className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-bg-elev)] px-3 py-2 text-[12px] text-[var(--color-text-muted)]">
            <span className="cb-spinner" /> thinking…
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <Avatar role={message.role} />
      <div className={cn("min-w-0 max-w-[calc(100%-2.5rem)] space-y-2", isUser && "items-end")}>
        {message.steps?.map((s, i) => (
          <StepCard key={i} step={s} />
        ))}
        {message.content && (
          <div
            className={cn(
              "cb-prose rounded-xl px-3 py-2 text-[13px]",
              isUser
                ? "bg-[var(--color-primary)]/15 ring-1 ring-[var(--color-primary)]/30"
                : "bg-[var(--color-bg-elev)]",
            )}
          >
            <Markdown text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" | "system" }) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1",
        isUser
          ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)] ring-[var(--color-primary)]/40"
          : "bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 text-[var(--color-text)] ring-[var(--color-border)]",
      )}
    >
      {isUser ? <User2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
    </div>
  );
}

function StepCard({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!step.detail;
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)]/60 text-[12px]">
      <button
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => hasDetail && setOpen((v) => !v)}
        disabled={!hasDetail}
      >
        <Terminal className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
        <span className="min-w-0 flex-1 truncate font-medium">{step.title}</span>
        {hasDetail &&
          (open ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
          ))}
      </button>
      {open && hasDetail && (
        <pre className="m-0 max-h-60 overflow-auto border-t border-[var(--color-border-subtle)] bg-[var(--color-bg)] px-2.5 py-2 font-[var(--font-mono)] text-[11.5px] leading-snug">
          {step.detail}
        </pre>
      )}
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        a: (props) => (
          <a {...props} target="_blank" rel="noopener noreferrer">
            {props.children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = ref.current?.innerText ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="group relative">
      <pre ref={ref}>{children}</pre>
      <button
        onClick={copy}
        className="absolute right-1.5 top-1.5 rounded-md bg-[var(--color-bg)]/80 p-1 text-[var(--color-text-dim)] opacity-0 ring-1 ring-[var(--color-border-subtle)] transition hover:text-[var(--color-text)] group-hover:opacity-100"
        title="Copy code"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}
