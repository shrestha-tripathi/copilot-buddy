import { useState, type FormEvent, type KeyboardEvent } from "react";

interface Props {
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

export function ChatInput({ disabled, onSubmit }: Props) {
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
        placeholder={disabled ? "Daemon offline…" : "Ask Copilot anything (Enter to send, Shift+Enter for newline)"}
        rows={3}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
}
