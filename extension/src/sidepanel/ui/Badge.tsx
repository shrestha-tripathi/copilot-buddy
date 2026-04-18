import type { ReactNode } from "react";
import { cn } from "../lib/cn";

interface BadgeProps {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warn" | "info";
  className?: string;
}

const tones: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-[var(--color-bg-elev-2)] text-[var(--color-text-muted)] border-[var(--color-border-subtle)]",
  success: "bg-[color-mix(in_srgb,var(--color-success)_20%,transparent)] text-[var(--color-success)] border-[color-mix(in_srgb,var(--color-success)_40%,transparent)]",
  danger:  "bg-[color-mix(in_srgb,var(--color-danger)_20%,transparent)] text-[var(--color-danger)] border-[color-mix(in_srgb,var(--color-danger)_40%,transparent)]",
  warn:    "bg-[color-mix(in_srgb,var(--color-warn)_20%,transparent)] text-[var(--color-warn)] border-[color-mix(in_srgb,var(--color-warn)_40%,transparent)]",
  info:    "bg-[color-mix(in_srgb,var(--color-primary)_20%,transparent)] text-[var(--color-primary)] border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
