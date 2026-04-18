import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useSettingsStore } from "./stores/settingsStore";
import { useSessionStore } from "./stores/sessionStore";
import { TokenOnboarding } from "./components/TokenOnboarding";
import { SessionPicker } from "./components/SessionPicker";
import { ChatPane } from "./components/ChatPane";
import { DaemonOffline } from "./components/DaemonOffline";
import { Header } from "./components/Header";

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
    const t = setInterval(async () => {
      const s = await probeDaemon(settings.baseUrl);
      if (!cancelled) setStatus(s);
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [settings.baseUrl, probeNonce]);

  const retry = useCallback(() => setProbeNonce((n) => n + 1), []);

  const toaster = (
    <Toaster
      position="top-right"
      theme="dark"
      toastOptions={{
        style: {
          background: "var(--color-bg-elev)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
        },
      }}
    />
  );

  if (!loaded) {
    return (
      <main className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
        Loading…
      </main>
    );
  }
  if (!settings.token) {
    return (
      <main className="flex h-full flex-col">
        <TokenOnboarding />
        {toaster}
      </main>
    );
  }
  if (status && !status.reachable) {
    return (
      <main className="flex h-full flex-col">
        <DaemonOffline baseUrl={settings.baseUrl} error={status.error} onRetry={retry} />
        {toaster}
      </main>
    );
  }

  const reachable = status?.reachable ?? false;

  return (
    <main className="flex h-full flex-col bg-[var(--color-bg)]">
      <Header
        status={status === null ? "checking" : reachable ? "online" : "offline"}
        statusDetail={status?.error}
      />
      <SessionPicker />
      <ChatPane daemonOnline={reachable} />
      {toaster}
    </main>
  );
}
