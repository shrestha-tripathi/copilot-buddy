import { useState } from "react";
import type { ElicitationRequest } from "../stores/chatStore";
import { Dialog, DialogContent } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/Select";
import { Switch } from "../ui/Switch";

interface Props {
  request: ElicitationRequest;
  onAccept: (content: Record<string, unknown>) => void;
  onDecline: () => void;
  onCancel: () => void;
}

interface SchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

function getProperties(
  schema: Record<string, unknown> | null | undefined,
): Record<string, SchemaProperty> {
  if (!schema || typeof schema !== "object") return {};
  const props = (schema as { properties?: Record<string, SchemaProperty> }).properties;
  return props ?? {};
}

export function ElicitationModal({ request, onAccept, onDecline, onCancel }: Props) {
  const properties = getProperties(request.requestedSchema);
  const fieldNames = Object.keys(properties);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const k of fieldNames) {
      const def = properties[k].default;
      if (def !== undefined) initial[k] = def;
    }
    return initial;
  });

  const setField = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent title={request.message || "Input requested"}>
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            onAccept(values);
          }}
        >
          {request.url && (
            <div className="truncate text-[11px] text-[var(--color-text-dim)]">
              URL: {request.url}
            </div>
          )}
          {fieldNames.length === 0 && (
            <div className="text-[12px] text-[var(--color-text-muted)]">
              No additional fields required.
            </div>
          )}
          {fieldNames.map((name) => {
            const prop = properties[name];
            const label = prop.title ?? name;
            const value = values[name] ?? "";
            if (prop.enum && prop.enum.length > 0) {
              return (
                <div key={name}>
                  <Label>{label}</Label>
                  <Select
                    value={String(value)}
                    onValueChange={(v) => setField(name, v)}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      {prop.enum.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {prop.description && (
                    <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
                      {prop.description}
                    </p>
                  )}
                </div>
              );
            }
            if (prop.type === "boolean") {
              return (
                <div key={name} className="flex items-center justify-between">
                  <div>
                    <Label>{label}</Label>
                    {prop.description && (
                      <p className="text-[11px] text-[var(--color-text-dim)]">
                        {prop.description}
                      </p>
                    )}
                  </div>
                  <Switch checked={!!value} onCheckedChange={(v) => setField(name, v)} />
                </div>
              );
            }
            const inputType =
              prop.type === "number" || prop.type === "integer" ? "number" : "text";
            return (
              <div key={name}>
                <Label>{label}</Label>
                <Input
                  type={inputType}
                  value={String(value)}
                  onChange={(e) =>
                    setField(
                      name,
                      inputType === "number" ? Number(e.target.value) : e.target.value,
                    )
                  }
                />
                {prop.description && (
                  <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
                    {prop.description}
                  </p>
                )}
              </div>
            );
          })}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="button" variant="outline" onClick={onDecline}>Decline</Button>
            <Button type="submit" variant="primary">Submit</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
