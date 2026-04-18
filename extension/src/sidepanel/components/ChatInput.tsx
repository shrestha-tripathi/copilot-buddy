import { useState, type FormEvent, type KeyboardEvent } from "react";

interface Props {
  disabled?: boolean;
  includeContext: boolean;
  onToggleContext: (next: boolean) => void;
  onSubmit: (text: string) => void;
}

export function ChatInput({ disabled, includeContext, onToggleContext, onSubmit }: Props) {
  const [value, setValue] = useState("");

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    onSubmit(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      submit();
    }
  };

  return (
    <form className="cb-input" onSubmit={submit}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={
          disabled
            ? "Daemon offline…"
            : "Ask Copilot anything (Enter to send, Shift+Enter for newline)"
        }
        rows={3}
        disabled={disabled}
      />
      <div className="cb-input__row">
        <label className="cb-toggle" title="Prepend page URL/title/selection to prompt">
          <input
            type="checkbox"
            checked={includeContext}
            onChange={(e) => onToggleContext(e.target.checked)}
          />
          Include page context
        </label>
        <button className="cb-btn cb-btn--primary" type="submit" disabled={disabled || !value.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}
