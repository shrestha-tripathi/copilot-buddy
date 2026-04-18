import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import { useApi } from "../api/useApi";
import { sessionsApi, type Session } from "@/shared/api/sessions";
import { useSessionStore } from "../stores/sessionStore";
import { useSettingsStore } from "../stores/settingsStore";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { cn } from "../lib/cn";

export function SessionPicker() {
  const api = useApi();
  const sessions = useSessionStore((s) => s.sessions);
  const setSessions = useSessionStore((s) => s.setSessions);
  const upsert = useSessionStore((s) => s.upsert);
  const remove = useSessionStore((s) => s.remove);
  const activeId = useSessionStore((s) => s.activeId);
  const setActive = useSessionStore((s) => s.setActive);
  const settings = useSettingsStore((s) => s.settings);

  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!settings.token) return;
    setLoading(true);
    sessionsApi
      .list(api)
      .then((res) => {
        const list = res?.sessions ?? [];
        setSessions(list);
        if (!activeId && list[0]) setActive(list[0].id);
      })
      .catch((err) => toast.error("Session list: " + err.message))
      .finally(() => setLoading(false));
  }, [api, settings.token, setSessions, activeId, setActive]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const onCreate = async () => {
    try {
      const s = await sessionsApi.create(api, {});
      upsert(s);
      setActive(s.id);
      setExpanded(true);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onDelete = async (s: Session) => {
    if (!confirm(`Delete session "${s.name || s.id.slice(0, 8)}"?`)) return;
    try {
      await sessionsApi.delete(api, s.id);
      remove(s.id);
      toast.success("Session deleted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const startRename = (s: Session) => {
    setEditingId(s.id);
    setDraftName(s.name || "");
  };

  const commitRename = async (id: string) => {
    const name = draftName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      const updated = await sessionsApi.update(api, id, { name });
      upsert(updated);
      toast.success("Renamed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const active = sessions.find((s) => s.id === activeId);

  return (
    <div className="shrink-0 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)]">
      {/* Active session row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-[var(--color-bg-elev-2)]"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse sessions" : "Expand sessions"}
        >
          {active ? (
            editingId === active.id ? (
              <input
                ref={inputRef}
                className="min-w-0 flex-1 rounded-md border border-[var(--color-primary)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[13px] outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40"
                value={draftName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => commitRename(active.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(active.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            ) : (
              <>
                <span className="truncate text-[13px] font-medium">
                  {active.name || "Untitled"}
                </span>
                {active.model && (
                  <Badge tone="info" className="shrink-0">{active.model}</Badge>
                )}
                {active.agent && (
                  <Badge tone="warn" className="shrink-0">@{active.agent}</Badge>
                )}
              </>
            )
          ) : (
            <span className="text-[12.5px] text-[var(--color-text-muted)]">
              {loading ? "Loading sessions…" : "No active session"}
            </span>
          )}
        </button>
        {active && editingId !== active.id && (
          <Button
            size="icon"
            variant="ghost"
            title="Rename"
            onClick={() => startRename(active)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="icon" variant="primary" title="New chat" onClick={onCreate}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Expanded list */}
      {expanded && (
        <ul className="max-h-48 overflow-y-auto border-t border-[var(--color-border-subtle)] p-1.5">
          {sessions.length === 0 && (
            <li className="px-2 py-3 text-center text-[12px] text-[var(--color-text-dim)]">
              No sessions yet.
            </li>
          )}
          {sessions.map((s) => (
            <li key={s.id}>
              <div
                role="button"
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] cursor-pointer",
                  "hover:bg-[var(--color-bg-elev-2)]",
                  s.id === activeId && "bg-[var(--color-bg-elev-2)] ring-1 ring-[var(--color-primary)]/40",
                )}
                onClick={() => {
                  setActive(s.id);
                  setExpanded(false);
                }}
              >
                <span className="truncate">{s.name || s.id.slice(0, 8)}</span>
                <span className="ml-auto hidden shrink-0 gap-1 group-hover:flex">
                  <button
                    className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(s);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    className="rounded p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-bg)] hover:text-[var(--color-danger)]"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </div>
              {editingId === s.id && s.id !== activeId && (
                <div className="flex items-center gap-1 px-2 py-1">
                  <input
                    autoFocus
                    className="min-w-0 flex-1 rounded-md border border-[var(--color-primary)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[12px] outline-none"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => commitRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(s.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button onMouseDown={(e) => { e.preventDefault(); commitRename(s.id); }}>
                    <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
                  </button>
                  <button onMouseDown={(e) => { e.preventDefault(); setEditingId(null); }}>
                    <X className="h-3.5 w-3.5 text-[var(--color-text-dim)]" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
