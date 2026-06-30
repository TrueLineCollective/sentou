import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
};

export function Wordmark({ className, size = "md" }: WordmarkProps) {
  return (
    <span
      className={cn(
        "font-black tracking-tight select-none",
        "[font-family:var(--font-inter)]",
        "text-transit-periwinkle",
        sizeMap[size],
        className,
      )}
      aria-label="Sentou"
    >
      Sentou
      <span className="text-transit-mint" aria-hidden="true">
        .
      </span>
    </span>
  );
}
