import { Settings, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SettingsDrawer } from "./SettingsDrawer";

interface Props {
  status: "checking" | "online" | "offline";
  statusDetail?: string;
}

export function Header({ status, statusDetail }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tone = status === "online" ? "success" : status === "offline" ? "danger" : "neutral";

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-user-from)] to-[var(--color-user-to)] text-white shadow-[0_4px_12px_rgba(124,92,255,0.35)]">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">Copilot Buddy</div>
            <div className="text-[10.5px] uppercase tracking-wider text-[var(--color-text-dim)]">
              Side panel
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={tone} className={cn(status === "checking" && "animate-pulse")} >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              tone === "success" ? "bg-[var(--color-success)]" :
              tone === "danger" ? "bg-[var(--color-danger)]" :
              "bg-[var(--color-text-dim)]",
            )} />
            {status === "checking" ? "checking" : status}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            title={statusDetail ?? "Settings"}
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
