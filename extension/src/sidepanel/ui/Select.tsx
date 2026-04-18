import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../lib/cn";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
  HTMLButtonElement,
  SelectPrimitive.SelectTriggerProps & { className?: string }
>(({ className, children, ...rest }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-8 items-center justify-between gap-1 rounded-lg border border-[var(--color-border)] " +
        "bg-[var(--color-bg-elev-2)] px-2.5 text-[12.5px] text-[var(--color-text)] " +
        "hover:bg-[color-mix(in_srgb,var(--color-bg-elev-2)_85%,#fff_15%)] " +
        "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40",
      className,
    )}
    {...rest}
  >
    {children}
    <SelectPrimitive.Icon>
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = forwardRef<
  HTMLDivElement,
  SelectPrimitive.SelectContentProps & { children: ReactNode }
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position="popper"
      sideOffset={4}
      className={cn(
        "z-[60] overflow-hidden rounded-lg border border-[var(--color-border)] " +
          "bg-[var(--color-bg-elev)] shadow-xl shadow-black/50 min-w-[var(--radix-select-trigger-width)] " +
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1 max-h-[280px]">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectItem = forwardRef<
  HTMLDivElement,
  SelectPrimitive.SelectItemProps
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-7 pr-2 " +
        "text-[12.5px] outline-none " +
        "data-[highlighted]:bg-[var(--color-bg-elev-2)] data-[highlighted]:text-[var(--color-text)]",
      className,
    )}
    {...props}
  >
    <span className="absolute left-1.5 inline-flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-[var(--color-primary)]" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";
