import { useEffect, useState } from "react";

interface DaemonStatus {
  reachable: boolean;
  error?: string;
}

const DEFAULT_DAEMON_URL = "http://127.0.0.1:8770";

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
  const [status, setStatus] = useState<DaemonStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await probeDaemon(DEFAULT_DAEMON_URL);
      if (!cancelled) setStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="cb-shell">
      <header className="cb-header">
        <h1>Copilot Buddy</h1>
        <span
          className={`cb-status ${
            status?.reachable ? "cb-status--ok" : "cb-status--down"
          }`}
        >
          {status === null
            ? "checking…"
            : status.reachable
              ? "daemon online"
              : `daemon offline${status.error ? ` (${status.error})` : ""}`}
        </span>
      </header>
      <section className="cb-body">
        <p>
          Side panel scaffold is alive. Chat UI lands in P5 — for now this view
          just probes the local Go daemon at <code>{DEFAULT_DAEMON_URL}</code>.
        </p>
      </section>
    </main>
  );
}
