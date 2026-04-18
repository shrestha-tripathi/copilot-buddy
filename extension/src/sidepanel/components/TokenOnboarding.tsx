import { useState } from "react";
import { KeyRound, Sparkles, Terminal } from "lucide-react";
import { useSettingsStore } from "../stores/settingsStore";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

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
    <div className="flex h-full items-center justify-center px-5 py-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] p-5 shadow-xl shadow-black/40"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-user-from)] to-[var(--color-user-to)] text-white shadow-lg shadow-fuchsia-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="text-[15px] font-semibold">Connect to daemon</h2>
          <p className="text-[12px] text-[var(--color-text-dim)]">
            Start the Go daemon and paste the bearer token printed on first run.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg)]/60 p-2 font-[var(--font-mono)] text-[11px] text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1.5 text-[var(--color-primary)]">
            <Terminal className="h-3 w-3" /> starter
          </div>
          <code>cd backend && make run</code>
        </div>

        <div>
          <Label>Daemon URL</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://127.0.0.1:8770"
            required
          />
        </div>
        <div>
          <Label>Bearer token</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="64-char hex"
            required
          />
        </div>

        <Button type="submit" variant="primary" className="w-full">
          <KeyRound className="h-3.5 w-3.5" /> Save & connect
        </Button>
        <p className="text-center text-[10.5px] text-[var(--color-text-dim)]">
          Stored locally in <code>chrome.storage.local</code>.
        </p>
      </form>
    </div>
  );
}
