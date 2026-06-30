"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  url: string;
  className?: string;
}

export function CopyButton({ url, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text from a hidden input
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "px-2.5 py-1 text-[9px] font-mono tracking-[0.2em] uppercase border rounded transition-all duration-150",
        copied
          ? "border-transit-mint text-transit-mint bg-transit-mint/10"
          : "border-transit-border text-transit-muted hover:border-transit-periwinkle/50 hover:text-transit-periwinkle",
        className,
      )}
      aria-label={copied ? "Link copied" : "Copy share link"}
    >
      {copied ? "Copied" : "Copy Link"}
    </button>
  );
}
