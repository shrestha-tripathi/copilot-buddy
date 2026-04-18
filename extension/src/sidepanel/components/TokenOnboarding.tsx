import { useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";

export function TokenOnboarding() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const [url, setUrl] = useState(settings.baseUrl);
  const [token, setToken] = useState(settings.token);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save({ baseUrl: url.trim(), token: token.trim() });
  };

  return (
    <form className="cb-onboarding" onSubmit={submit}>
      <h2>Connect to Copilot Buddy daemon</h2>
      <p>
        Start the Go daemon and paste the bearer token printed on first run.
        The token is stored in <code>chrome.storage.local</code>.
      </p>
      <label>
        Daemon URL
        <input value={url} onChange={(e) => setUrl(e.target.value)} required />
      </label>
      <label>
        Bearer token
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="64-char hex"
          required
        />
      </label>
      <button type="submit">Save & connect</button>
    </form>
  );
}
