import * as SliderPrimitive from "@radix-ui/react-slider";
import { forwardRef } from "react";
import { cn } from "../lib/cn";

export const Slider = forwardRef<HTMLSpanElement, SliderPrimitive.SliderProps>(
  ({ className, ...props }, ref) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--color-bg-elev-2)]">
        <SliderPrimitive.Range className="absolute h-full bg-[var(--color-primary)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-bg)] shadow
                                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40" />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = "Slider";
