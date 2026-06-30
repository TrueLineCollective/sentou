import { forwardRef, useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FieldProps extends React.ComponentProps<"input"> {
  label: string;
  error?: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, hint, className, id: externalId, ...props }, ref) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    const describedBy = [error ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={id}
          className="text-sm font-medium text-transit-periwinkle"
        >
          {label}
        </label>
        <Input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(
            "bg-transit-surface border-transit-border text-transit-periwinkle",
            "placeholder:text-transit-muted",
            "focus-visible:ring-transit-mint focus-visible:border-transit-mint",
            "h-11",
            error && "border-destructive focus-visible:ring-destructive",
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-transit-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Field.displayName = "TransitField";
