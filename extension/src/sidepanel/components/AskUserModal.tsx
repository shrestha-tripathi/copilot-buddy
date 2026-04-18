import { useState } from "react";
import type { AskUserRequest } from "../stores/chatStore";

interface Props {
  request: AskUserRequest;
  onSubmit: (answer: string, wasFreeform: boolean) => void;
  onCancel: () => void;
}

export function AskUserModal({ request, onSubmit, onCancel }: Props) {
  const [freeform, setFreeform] = useState("");

  const submitChoice = (choice: string) => onSubmit(choice, false);
  const submitFreeform = (e: React.FormEvent) => {
    e.preventDefault();
    if (freeform.trim()) onSubmit(freeform, true);
  };

  return (
    <div className="cb-modal-backdrop" onClick={onCancel}>
      <div className="cb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cb-modal-title">{request.question}</div>
        {request.choices.length > 0 && (
          <div className="cb-choice-list">
            {request.choices.map((c) => (
              <button key={c} type="button" className="cb-choice" onClick={() => submitChoice(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        {request.allowFreeform && (
          <form onSubmit={submitFreeform} className="cb-freeform">
            <input
              type="text"
              value={freeform}
              onChange={(e) => setFreeform(e.target.value)}
              placeholder="Type your answer…"
              autoFocus
            />
            <button type="submit" className="cb-btn cb-btn--primary" disabled={!freeform.trim()}>Send</button>
          </form>
        )}
        <div className="cb-modal-actions">
          <button type="button" className="cb-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
