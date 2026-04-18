/**
 * Daemon-offline screen — shown when /api/health probe fails. Gives the
 * user copy-paste instructions to start the Go daemon.
 */

import { useSettingsStore } from "../stores/settingsStore";

interface Props {
  baseUrl: string;
  error?: string;
  onRetry: () => void;
}

export function DaemonOffline({ baseUrl, error, onRetry }: Props) {
  const save = useSettingsStore((s) => s.save);
  const settings = useSettingsStore((s) => s.settings);

  return (
    <div className="cb-offline">
      <div className="cb-offline__icon" aria-hidden>⚠</div>
      <h2>Daemon unreachable</h2>
      <p>
        Couldn't reach the Copilot Buddy daemon at <code>{baseUrl}</code>
        {error ? <> — <em>{error}</em></> : null}.
      </p>
      <p>Start it from a terminal:</p>
      <pre>cd backend && make run</pre>
      <p>Or run the binary directly:</p>
      <pre>copilot-buddy --port 8770 \
  --origins chrome-extension://&lt;id&gt;</pre>
      <label style={{ textAlign: "left" }}>
        Daemon URL
        <input
          defaultValue={settings.baseUrl}
          onBlur={(e) => save({ baseUrl: e.target.value.trim() })}
        />
      </label>
      <button className="cb-btn cb-btn--primary" onClick={onRetry}>Retry connection</button>
      <button
        className="cb-btn cb-btn--ghost"
        onClick={() => save({ token: "" })}
        title="Forget the bearer token and re-onboard"
      >
        Reset token
      </button>
    </div>
  );
}
