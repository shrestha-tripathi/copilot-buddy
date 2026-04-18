import { AlertTriangle, RotateCw } from "lucide-react";
import { useSettingsStore } from "../stores/settingsStore";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

interface Props {
  baseUrl: string;
  error?: string;
  onRetry: () => void;
}

export function DaemonOffline({ baseUrl, error, onRetry }: Props) {
  const save = useSettingsStore((s) => s.save);
  const settings = useSettingsStore((s) => s.settings);

  return (
    <div className="flex h-full items-center justify-center px-5 py-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] p-5 shadow-xl shadow-black/40">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-danger)]/15 text-[var(--color-danger)] ring-1 ring-[var(--color-danger)]/40">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="text-[15px] font-semibold">Daemon unreachable</h2>
          <p className="text-[12px] text-[var(--color-text-dim)]">
            Couldn't reach <code>{baseUrl}</code>
            {error ? <> — <em>{error}</em></> : null}
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg)]/60 p-2 font-[var(--font-mono)] text-[11px] text-[var(--color-text-muted)]">
          <div className="text-[var(--color-primary)]">start daemon</div>
          <code>cd backend && make run</code>
          <div className="mt-1 text-[var(--color-primary)]">or run binary</div>
          <code>copilot-buddy --port 8770</code>
        </div>

        <div>
          <Label>Daemon URL</Label>
          <Input
            defaultValue={settings.baseUrl}
            onBlur={(e) => save({ baseUrl: e.target.value.trim() })}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={onRetry}>
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </Button>
          <Button variant="ghost" onClick={() => save({ token: "" })} title="Forget the bearer token">
            Reset token
          </Button>
        </div>
      </div>
    </div>
  );
}
