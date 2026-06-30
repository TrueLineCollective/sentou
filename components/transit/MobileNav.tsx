"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Wordmark } from "./Wordmark";
import { NavRail } from "./NavRail";
import { SignOutButton } from "./SignOutButton";

interface MobileNavProps {
  userName: string;
  userEmail: string;
}

export function MobileNav({ userName, userEmail }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close drawer and return focus to the hamburger toggle.
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  return (
    <>
      {/* ── Sticky top bar (mobile only) ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-transit-border bg-transit-canvas/95 backdrop-blur-sm sticky top-0 z-30">
        <div>
          <Wordmark size="sm" />
          <p className="mt-0.5 text-[8px] font-mono tracking-[0.3em] uppercase text-transit-muted">
            Command
          </p>
        </div>

        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
          className="w-11 h-11 flex items-center justify-center rounded-lg border border-transit-border text-transit-periwinkle hover:border-transit-periwinkle/50 transition-colors duration-150"
        >
          {open ? (
            /* X icon */
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1 1L13 13M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            /* Hamburger icon */
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
              <path
                d="M0 1h16M0 6h16M0 11h16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* ── Overlay + drawer ─────────────────────────────────────────────
          Portaled to <body> so they escape the layout's `relative z-10`
          mobile-nav wrapper. That wrapper is a sibling stacking context of
          <main> at the same z-index; without the portal the drawer's z-50
          stays trapped inside it and <main> (a later sibling) paints over
          both the scrim and the panel, making them look see-through. */}
      {open &&
        createPortal(
          <>
            {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={close}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-label="Navigation"
            aria-modal="true"
            className="fixed top-0 left-0 right-0 z-50 bg-transit-canvas border-b border-transit-border shadow-2xl"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-transit-border">
              <div>
                <Wordmark size="md" />
                <p className="mt-1 text-[9px] font-mono tracking-[0.3em] uppercase text-transit-muted">
                  Command
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close navigation"
                className="w-11 h-11 flex items-center justify-center rounded-lg border border-transit-border text-transit-periwinkle hover:border-transit-periwinkle/50 transition-colors duration-150"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M1 1L13 13M13 1L1 13"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Route spine navigation — clicking any link closes the drawer via
                event delegation so NavRail itself needs no modification */}
            <div
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) close();
              }}
            >
              <NavRail />
            </div>

            {/* User identity + sign-out */}
            <div className="px-5 py-4 border-t border-transit-border">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-transit-mint flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-transit-mint">
                  Active
                </span>
              </div>
              <p className="text-sm font-medium text-transit-periwinkle truncate">{userName}</p>
              <p className="mt-0.5 text-[11px] text-transit-muted truncate">{userEmail}</p>
              <SignOutButton />
            </div>
          </div>
          </>,
          document.body,
        )}
    </>
  );
}
