import type { LabelHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1 block text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]",
        className,
      )}
      {...rest}
    />
  );
}
