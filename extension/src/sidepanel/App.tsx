import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "./stores/settingsStore";
import { useSessionStore } from "./stores/sessionStore";
import { TokenOnboarding } from "./components/TokenOnboarding";
import { SessionPicker } from "./components/SessionPicker";
import { ChatPane } from "./components/ChatPane";
import { DaemonOffline } from "./components/DaemonOffline";

interface DaemonStatus {
  reachable: boolean;
  error?: string;
}

async function probeDaemon(baseUrl: string): Promise<DaemonStatus> {
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    if (!res.ok) return { reachable: false, error: `HTTP ${res.status}` };
    return { reachable: true };
  } catch (err) {
    return { reachable: false, error: (err as Error).message };
  }
}

export function App() {
  const loaded = useSettingsStore((s) => s.loaded);
  const settings = useSettingsStore((s) => s.settings);
  const load = useSettingsStore((s) => s.load);
  const hydrateActive = useSessionStore((s) => s.hydrateActive);
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [probeNonce, setProbeNonce] = useState(0);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    void hydrateActive();
  }, [hydrateActive]);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    (async () => {
      const s = await probeDaemon(settings.baseUrl);
      if (!cancelled) setStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.baseUrl, probeNonce]);

  const retry = useCallback(() => setProbeNonce((n) => n + 1), []);

  if (!loaded) {
    return (
      <main className="cb-shell">
        <div className="cb-empty">Loading…</div>
      </main>
    );
  }
  if (!settings.token) {
    return (
      <main className="cb-shell">
        <TokenOnboarding />
      </main>
    );
  }
  if (status && !status.reachable) {
    return (
      <main className="cb-shell">
        <DaemonOffline baseUrl={settings.baseUrl} error={status.error} onRetry={retry} />
      </main>
    );
  }

  const reachable = status?.reachable ?? false;

  return (
    <main className="cb-shell">
      <header className="cb-header">
        <h1>Copilot Buddy</h1>
        <span
          className={`cb-status ${reachable ? "cb-status--ok" : "cb-status--down"}`}
          title={status?.error}
        >
          {status === null
            ? "checking…"
            : reachable
              ? "daemon online"
              : `offline${status.error ? ` (${status.error})` : ""}`}
        </span>
      </header>
      <SessionPicker />
      <ChatPane daemonOnline={reachable} />
    </main>
  );
}
