import { Settings } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { Button } from "../ui/Button";
import { CopilotMark } from "../ui/CopilotMark";
import { SettingsDrawer } from "./SettingsDrawer";

interface Props {
  status: "checking" | "online" | "offline";
  statusDetail?: string;
}

export function Header({ status, statusDetail }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dotClass =
    status === "online"
      ? "bg-[var(--color-success)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-success)_30%,transparent)]"
      : status === "offline"
      ? "bg-[var(--color-danger)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_30%,transparent)]"
      : "bg-[var(--color-text-dim)] animate-pulse";

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elev)]/80 px-3 py-2 backdrop-blur">
        <CopilotMark size={22} />
        <span
          title={statusDetail ?? status}
          className={cn("ml-1 inline-block h-2 w-2 rounded-full", dotClass)}
          aria-label={`Daemon ${status}`}
        />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          title="Settings"
          aria-label="Open settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
