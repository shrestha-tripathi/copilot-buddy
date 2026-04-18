import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

export const Switch = forwardRef<HTMLButtonElement, SwitchPrimitive.SwitchProps>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full " +
          "border border-transparent transition-colors " +
          "data-[state=checked]:bg-[var(--color-primary)] " +
          "data-[state=unchecked]:bg-[var(--color-bg-elev-2)] " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform
                   data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-[2px]"
      />
    </SwitchPrimitive.Root>
  ),
);
Switch.displayName = "Switch";
