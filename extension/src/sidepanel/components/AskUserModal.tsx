import { useState } from "react";
import type { AskUserRequest } from "../stores/chatStore";
import { Dialog, DialogContent } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface Props {
  request: AskUserRequest;
  onSubmit: (answer: string, wasFreeform: boolean) => void;
  onCancel: () => void;
}

export function AskUserModal({ request, onSubmit, onCancel }: Props) {
  const [freeform, setFreeform] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent title={request.question}>
        <div className="space-y-3 p-5">
          {request.choices.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {request.choices.map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() => onSubmit(c, false)}
                >
                  {c}
                </Button>
              ))}
            </div>
          )}
          {request.allowFreeform && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (freeform.trim()) onSubmit(freeform, true);
              }}
            >
              <Input
                value={freeform}
                onChange={(e) => setFreeform(e.target.value)}
                placeholder="Type your answer…"
                autoFocus
              />
              <Button type="submit" variant="primary" disabled={!freeform.trim()}>
                Send
              </Button>
            </form>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
