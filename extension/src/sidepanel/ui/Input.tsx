import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const inputBase =
  "w-full rounded-lg bg-[var(--color-bg-elev-2)] border border-[var(--color-border)] " +
  "px-3 py-2 text-[13px] text-[var(--color-text)] placeholder-[var(--color-text-dim)] " +
  "transition-colors focus:outline-none focus:border-[var(--color-primary)] " +
  "focus:ring-2 focus:ring-[var(--color-primary)]/30";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn(inputBase, "h-9", className)} {...rest} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea ref={ref} className={cn(inputBase, "min-h-[80px] resize-y", className)} {...rest} />
));
Textarea.displayName = "Textarea";
