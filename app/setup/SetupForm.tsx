"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/transit/Wordmark";
import { Button } from "@/components/transit/Button";
import { Field } from "@/components/transit/Field";
import { authClient } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Background grid — 48-px transit-map paper
// ---------------------------------------------------------------------------
function TransitGrid() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="tgrid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#292e42" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#tgrid)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// RouteLine — the hero spine of the composition.
//
// A bold vertical periwinkle-to-mint gradient line connects two station dots:
//   origin  (periwinkle, top)   — "You are here"
//   destination (mint, bottom)  — "Your workspace"
//
// GSAP draws the line from origin to destination on mount.
// Resting state (reduced-motion, hidden tab): line is fully visible by default
// because no strokeDasharray is set in SVG markup.  GSAP only applies the dash
// when it runs the draw-in, and snaps to progress(1) if the tab is hidden mid-draw.
// A `data-route-ready` sentinel on <html> fires when the animation is complete
// so Playwright can wait for it before screenshotting.
// ---------------------------------------------------------------------------
function RouteLine() {
  const lineRef = useRef<SVGPathElement>(null);
  const destRingRef = useRef<SVGCircleElement>(null);
  const destDotRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const line = lineRef.current;
    const destRing = destRingRef.current;
    const destDot = destDotRef.current;
    if (!line || !destRing || !destDot) return;

    const markReady = () =>
      document.documentElement.setAttribute("data-route-ready", "1");

    // Reduced-motion: everything stays visible, sentinel fires immediately.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markReady();
      return;
    }

    // Hidden tab: leave SVG at its default (fully drawn) state, fire sentinel.
    if (document.hidden) {
      markReady();
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    import("gsap").then(({ gsap }) => {
      if (cancelled) return;

      const length = line.getTotalLength();

      // Hide line and destination dots; origin dot is always visible.
      gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
      gsap.set([destRing, destDot], { opacity: 0 });

      const tl = gsap.timeline();
      tl
        // Draw line from origin to destination
        .to(line, {
          strokeDashoffset: 0,
          duration: 1.5,
          ease: "power3.inOut",
        })
        // Destination ring arrives
        .to(destRing, { opacity: 1, duration: 0.3, ease: "power2.out" }, "-=0.15")
        // Inner dot fills in
        .to(destDot, { opacity: 1, duration: 0.25, ease: "power2.out" }, "-=0.2")
        // Signal screenshot-readiness
        .add(markReady);

      // If the tab hides mid-draw, snap to finished state immediately.
      const onVisibility = () => {
        if (document.hidden) {
          tl.progress(1);
          markReady();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      cleanup = () => {
        document.removeEventListener("visibilitychange", onVisibility);
        tl.progress(1).kill();
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <svg
      width="60"
      height="580"
      viewBox="0 0 60 580"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <defs>
        {/*
         * gradientUnits="userSpaceOnUse" is mandatory here.
         * The path is a pure vertical line (zero-width bounding box).
         * The default objectBoundingBox degenrates on zero-width paths and
         * renders an invisible stroke.  userSpaceOnUse fixes that.
         */}
        <linearGradient
          id="vRouteGrad"
          x1="30"
          y1="30"
          x2="30"
          y2="548"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#c0caf5" />
          <stop offset="100%" stopColor="#7ee787" />
        </linearGradient>
      </defs>

      {/* Origin station — periwinkle. Always visible: you start here. */}
      <circle cx="30" cy="30" r="13" fill="#1a1b26" stroke="#c0caf5" strokeWidth="4" />
      <circle cx="30" cy="30" r="6" fill="#c0caf5" />

      {/* Route line — GSAP draws it top-to-bottom; fully visible without JS. */}
      <path
        ref={lineRef}
        d="M30,30 L30,548"
        stroke="url(#vRouteGrad)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Destination station — mint. Fades in when line arrives. */}
      <circle
        ref={destRingRef}
        cx="30"
        cy="548"
        r="15"
        fill="#1a1b26"
        stroke="#7ee787"
        strokeWidth="4"
      />
      <circle ref={destDotRef} cx="30" cy="548" r="7" fill="#7ee787" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SetupForm
// ---------------------------------------------------------------------------
export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await authClient.signUp.email({ name, email, password });

      if (result.error) {
        setError(result.error.message ?? "Sign up failed. Try again.");
        return;
      }

      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="transit-canvas relative min-h-screen bg-transit-canvas text-transit-periwinkle overflow-hidden">
      <TransitGrid />

      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-12 pt-8 pb-6">
        <Wordmark size="md" />
        <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-transit-muted">
          Owner Setup
        </span>
      </nav>

      {/* ── Main composition ─────────────────────────────────────────────── */}
      <div className="relative z-10 grid grid-cols-[38%_62%]" style={{ minHeight: "calc(100vh - 80px)" }}>

        {/* ── Left column: transit route-map zone ──────────────────────── */}
        <div className="flex flex-col px-12 pt-2 pb-10 border-r border-transit-border">

          {/* Line identifier */}
          <div className="mb-8 flex items-center gap-3">
            <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
              Line 01
            </span>
            <span className="flex-1 border-t border-transit-border" />
          </div>

          {/* Origin label above the route line */}
          <div className="mb-5">
            <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-muted">
              Origin
            </span>
            <p
              className="text-xl font-black text-transit-periwinkle mt-0.5 leading-tight"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              You
            </p>
          </div>

          {/* Route line + alongside content */}
          <div className="flex gap-8">
            <RouteLine />

            {/* Content aligned with station positions */}
            <div className="flex flex-col justify-between" style={{ height: 580 }}>
              {/* Near origin: editorial copy */}
              <div className="pt-1">
                <p className="text-transit-muted text-sm leading-relaxed max-w-[240px]">
                  First account claims the workspace. Your artifacts, your rules.
                </p>
              </div>

              {/* Near destination: workspace label */}
              <div className="pb-1">
                <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-muted">
                  Destination
                </span>
                <p
                  className="text-xl font-black text-transit-mint mt-0.5 leading-tight"
                  style={{ fontFamily: "var(--font-inter)" }}
                >
                  Your workspace
                </p>
              </div>
            </div>
          </div>

          {/* Push remaining space + footer */}
          <div className="flex-1" />
          <p className="text-xs text-transit-muted mt-8">
            Already have an account?{" "}
            <a href="/login" className="text-transit-mint hover:underline">
              Log in
            </a>
          </p>
        </div>

        {/* ── Right column: form zone ──────────────────────────────────── */}
        <div className="flex flex-col justify-center px-16 py-12">

          {/* Destination marker — connects form to the transit map motif */}
          <div className="flex items-center gap-3 mb-6">
            <span className="w-2.5 h-2.5 rounded-full bg-transit-mint ring-4 ring-transit-mint/20 flex-shrink-0" />
            <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-mint">
              Destination Workspace
            </span>
          </div>

          {/* Heading */}
          <h1
            className="text-[clamp(2.2rem,3vw,3.25rem)] font-black leading-tight text-transit-periwinkle mb-2"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Claim your
            <br />
            <span className="text-transit-mint">instance.</span>
          </h1>
          <p className="text-transit-muted text-sm mb-8 max-w-xs">
            One owner. One workspace.
          </p>

          {/* Form — no card container; fields sit directly on the canvas */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 max-w-md w-full"
            noValidate
          >
            <Field
              label="Name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
            <Field
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Field
              label="Password"
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              intent="primary"
              type="submit"
              disabled={loading}
              className="mt-2 h-12 text-base"
            >
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="text-xs text-transit-muted mt-6">
            First account becomes the owner automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
