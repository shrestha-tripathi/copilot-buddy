import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { sessionsApi, type Session } from "@/shared/api/sessions";
import { useSessionStore } from "../stores/sessionStore";
import { useSettingsStore } from "../stores/settingsStore";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.token) return;
    setLoading(true);
    sessionsApi
      .list(api)
      .then((res) => {
        setSessions(res.sessions);
        if (!activeId && res.sessions[0]) setActive(res.sessions[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [api, settings.token, setSessions, activeId, setActive]);

  const onCreate = async () => {
    try {
      const s = await sessionsApi.create(api, {});
      upsert(s);
      setActive(s.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDelete = async (s: Session) => {
    if (!confirm(`Delete session "${s.name || s.id.slice(0, 8)}"?`)) return;
    try {
      await sessionsApi.delete(api, s.id);
      remove(s.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="cb-sessions">
      <div className="cb-sessions__head">
        <span>Sessions</span>
        <button onClick={onCreate}>+ New</button>
      </div>
      {loading && <div className="cb-empty">Loading…</div>}
      {error && <div className="cb-error">{error}</div>}
      <ul>
        {sessions.map((s) => (
          <li
            key={s.id}
            className={s.id === activeId ? "cb-session cb-session--active" : "cb-session"}
            onClick={() => setActive(s.id)}
          >
            <span className="cb-session__name">{s.name || s.id.slice(0, 8)}</span>
            <button
              className="cb-session__del"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s);
              }}
              title="Delete"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
