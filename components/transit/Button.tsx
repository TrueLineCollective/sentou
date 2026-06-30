import { forwardRef } from "react";
import { Button as ShadButton, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TransitButtonProps = ButtonProps & {
  intent?: "primary" | "ghost" | "destructive";
};

const intentMap: Record<string, string> = {
  primary:
    "bg-transit-mint text-transit-canvas font-bold hover:bg-transit-mint/90 focus-visible:ring-transit-mint",
  ghost:
    "bg-transparent text-transit-periwinkle border border-transit-border hover:bg-transit-elevated",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

export const Button = forwardRef<HTMLButtonElement, TransitButtonProps>(
  ({ intent = "primary", className, variant, ...props }, ref) => {
    // intent overrides shadcn variant when provided
    const resolvedVariant = intent ? undefined : variant;
    return (
      <ShadButton
        ref={ref}
        variant={resolvedVariant ?? "default"}
        className={cn(
          intent ? intentMap[intent] : undefined,
          "rounded-lg transition-all duration-150",
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "TransitButton";
