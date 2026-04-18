import { useState } from "react";
import type { ElicitationRequest } from "../stores/chatStore";

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

function getProperties(schema: Record<string, unknown> | null | undefined): Record<string, SchemaProperty> {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAccept(values);
  };

  return (
    <div className="cb-modal-backdrop" onClick={onCancel}>
      <div className="cb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cb-modal-title">{request.message || "Input requested"}</div>
        {request.url && <div className="cb-modal-sub">URL: {request.url}</div>}
        <form onSubmit={handleSubmit}>
          {fieldNames.length === 0 && (
            <div className="cb-modal-sub">No additional fields required.</div>
          )}
          {fieldNames.map((name) => {
            const prop = properties[name];
            const label = prop.title ?? name;
            const value = values[name] ?? "";
            if (prop.enum && prop.enum.length > 0) {
              return (
                <label key={name} className="cb-field">
                  <span>{label}</span>
                  <select
                    value={String(value)}
                    onChange={(e) => setField(name, e.target.value)}
                  >
                    {prop.enum.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            if (prop.type === "boolean") {
              return (
                <label key={name} className="cb-field cb-field-row">
                  <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => setField(name, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              );
            }
            const inputType = prop.type === "number" || prop.type === "integer" ? "number" : "text";
            return (
              <label key={name} className="cb-field">
                <span>{label}</span>
                <input
                  type={inputType}
                  value={String(value)}
                  onChange={(e) =>
                    setField(name, inputType === "number" ? Number(e.target.value) : e.target.value)
                  }
                />
                {prop.description && <small>{prop.description}</small>}
              </label>
            );
          })}
          <div className="cb-modal-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="button" onClick={onDecline}>Decline</button>
            <button type="submit">Submit</button>
          </div>
        </form>
      </div>
    </div>
  );
}
