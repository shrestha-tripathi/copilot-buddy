import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

type Variant = "primary" | "ghost" | "outline" | "danger" | "secondary";
type Size = "sm" | "md" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium " +
  "transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/60 " +
  "focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)]";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-white hover:brightness-110 active:brightness-95 " +
    "shadow-[0_1px_0_rgba(255,255,255,0.1)_inset,0_4px_12px_rgba(124,92,255,0.25)]",
  secondary:
    "bg-[var(--color-bg-elev-2)] text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-bg-elev-2)_85%,#fff_15%)] border border-[var(--color-border)]",
  ghost:
    "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-elev-2)]",
  outline:
    "bg-transparent text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-bg-elev-2)]",
  danger:
    "bg-[var(--color-danger)] text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-9 px-3.5 text-[13px]",
  icon: "h-8 w-8",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "secondary", size = "md", ...rest }, ref) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  ),
);
Button.displayName = "Button";
