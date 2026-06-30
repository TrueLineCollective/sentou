"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface RouteCardActionsProps {
  linkId: string;
  slug: string;
  viewerUrl: string;
  status: "live" | "expired" | "revoked";
}

export function RouteCardActions({
  linkId,
  slug,
  viewerUrl,
  status,
}: RouteCardActionsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed silently; the URL is visible in the Open button.
    }
  }

  async function handleRevoke() {
    setConfirmingRevoke(false);
    setRevoking(true);
    try {
      const res = await fetch("/api/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: linkId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setRevoking(false);
    }
  }

  const btn = cn(
    // 44px min touch target on mobile; compact on desktop (md+).
    "inline-flex items-center justify-center min-h-[44px] md:min-h-0",
    "px-2.5 py-1 text-[9px] font-mono tracking-[0.2em] uppercase border rounded",
    "transition-colors duration-150",
  );

  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`Actions for route ${slug}`}
    >
      <Link
        href={`/routes/${linkId}`}
        className={cn(
          btn,
          "text-transit-muted hover:text-transit-periwinkle",
          "border-transit-border/40 hover:border-transit-border",
        )}
        aria-label={`View analytics for route ${slug}`}
      >
        Analytics
      </Link>

      <a
        href={viewerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          btn,
          "text-transit-muted hover:text-transit-periwinkle",
          "border-transit-border/40 hover:border-transit-border",
        )}
        aria-label={`Open route ${slug} in new tab`}
      >
        Open
      </a>

      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          btn,
          copied
            ? "text-transit-mint border-transit-mint/50"
            : "text-transit-muted hover:text-transit-periwinkle border-transit-border/40 hover:border-transit-border",
        )}
        aria-label="Copy viewer URL to clipboard"
      >
        {copied ? "Copied" : "Copy"}
      </button>

      {status === "live" && (
        confirmingRevoke ? (
          <>
            <span className="text-[9px] font-mono text-transit-muted mr-0.5">
              Revoke?
            </span>
            <button
              type="button"
              onClick={() => setConfirmingRevoke(false)}
              className={cn(
                btn,
                "text-transit-muted border-transit-border/40 hover:text-transit-periwinkle hover:border-transit-border",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={revoking}
              className={cn(
                btn,
                "text-red-400 border-red-400/40 hover:border-red-400",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
              aria-label="Confirm revoke this route"
            >
              {revoking ? "..." : "Confirm"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRevoke(true)}
            className={cn(
              btn,
              "text-transit-muted/50 hover:text-red-400",
              "border-transit-border/30 hover:border-red-400/40",
            )}
            aria-label="Revoke this route"
          >
            Revoke
          </button>
        )
      )}
    </div>
  );
}
