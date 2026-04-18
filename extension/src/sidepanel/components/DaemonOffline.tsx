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
    <div className="cb-onboarding">
      <h2>Daemon unreachable</h2>
      <p>
        Couldn't reach the Copilot Buddy daemon at <code>{baseUrl}</code>
        {error ? <> — <em>{error}</em></> : null}.
      </p>
      <p>Start it from a terminal:</p>
      <pre className="cb-codeblock">cd backend && make run</pre>
      <p>
        Or run the binary directly with a custom port:
      </p>
      <pre className="cb-codeblock">copilot-buddy --port 8770 \
  --origins chrome-extension://&lt;your-extension-id&gt;</pre>
      <label>
        Daemon URL
        <input
          defaultValue={settings.baseUrl}
          onBlur={(e) => save({ baseUrl: e.target.value.trim() })}
        />
      </label>
      <button onClick={onRetry}>Retry connection</button>
      <button
        onClick={() => save({ token: "" })}
        style={{ marginTop: 4 }}
        title="Forget the bearer token and re-onboard"
      >
        Reset token
      </button>
    </div>
  );
}
