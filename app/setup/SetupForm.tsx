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
// RouteLineHero — the hero composition element.
//
// A bold horizontal periwinkle-to-mint gradient line spans the full content
// width at ~62%.  The origin dot (periwinkle) is at the far left.  The
// destination dot (mint) sits at exactly the 62% mark — which is also the
// left edge of the form column below it.  The route literally terminates
// at the form: the user's eye follows the line to the destination dot and
// finds the first form field directly below.
//
// gradientUnits="userSpaceOnUse" is required: the default objectBoundingBox
// degenerates on a zero-height horizontal line and produces an invisible stroke.
//
// GSAP draws left-to-right on mount (1.5s); destination dot fades in on arrival.
// Resting state (reduced-motion, hidden tab): fully drawn (no dasharray in markup).
// Sentinel data-route-ready="1" on <html> fires when the animation is done.
// ---------------------------------------------------------------------------
function RouteLineHero() {
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

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markReady();
      return;
    }

    if (document.hidden) {
      markReady();
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    import("gsap").then(({ gsap }) => {
      if (cancelled) return;

      const length = line.getTotalLength();

      // Hide the route line and destination; origin is always visible.
      gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
      gsap.set([destRing, destDot], { opacity: 0 });

      const tl = gsap.timeline();
      tl
        .to(line, {
          strokeDashoffset: 0,
          duration: 1.5,
          ease: "power3.inOut",
        })
        .to(destRing, { opacity: 1, duration: 0.3, ease: "power2.out" }, "-=0.1")
        .to(destDot, { opacity: 1, duration: 0.25, ease: "power2.out" }, "-=0.2")
        .add(markReady);

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
      width="100%"
      height="80"
      viewBox="0 0 1200 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="h-auto md:h-[80px]"
    >
      <defs>
        {/*
         * userSpaceOnUse: gradient vector is specified in SVG user coordinates.
         * objectBoundingBox (the default) degenerates when the path height = 0
         * (a horizontal line) and makes the stroke invisible.
         */}
        <linearGradient
          id="hRouteGrad"
          x1="20"
          y1="40"
          x2="746"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#c0caf5" />
          <stop offset="100%" stopColor="#7ee787" />
        </linearGradient>
      </defs>

      {/* Station labels above line */}
      <text
        x="20"
        y="16"
        fontSize={9}
        fill="#565f89"
        fontFamily="monospace"
        letterSpacing={2}
        textAnchor="middle"
      >
        ORIGIN
      </text>
      <text
        x="746"
        y="16"
        fontSize={9}
        fill="#565f89"
        fontFamily="monospace"
        letterSpacing={2}
        textAnchor="middle"
      >
        DESTINATION
      </text>

      {/* Origin station — periwinkle. Always visible: you start here. */}
      <circle cx="20" cy="40" r="13" fill="#1a1b26" stroke="#c0caf5" strokeWidth="4" />
      <circle cx="20" cy="40" r="6" fill="#c0caf5" />

      {/* Route line — GSAP draws left-to-right; fully visible without JS. */}
      <path
        ref={lineRef}
        d="M20,40 L746,40"
        stroke="url(#hRouteGrad)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Destination station — mint. Fades in when line arrives. */}
      <circle
        ref={destRingRef}
        cx="746"
        cy="40"
        r="15"
        fill="#1a1b26"
        stroke="#7ee787"
        strokeWidth="4"
      />
      <circle ref={destDotRef} cx="746" cy="40" r="7" fill="#7ee787" />

      {/* Station names below line */}
      <text
        x="20"
        y="68"
        fontSize={11}
        fill="#c0caf5"
        fontFamily="monospace"
        textAnchor="middle"
        fontWeight="bold"
      >
        YOU
      </text>
      {/* No label under destination: the form IS the destination. */}
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
    <div className="transit-canvas relative min-h-dvh flex flex-col bg-transit-canvas text-transit-periwinkle overflow-hidden">
      <TransitGrid />

      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-4 md:px-12 pt-6 md:pt-8 pb-4">
        <Wordmark size="md" />
        <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-transit-muted">
          Owner Setup
        </span>
      </nav>

      {/* ── Main composition ─────────────────────────────────────────────── */}
      {/*
       * CSS grid: two columns (62% / 38%) at md+, single column on mobile.
       * The destination dot in the route line SVG sits at exactly 62% of the
       * SVG width — the same boundary as the desktop column split.
       */}
      <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-[62%_38%] md:grid-rows-[auto_auto_1fr] px-4 md:px-12 pb-4 md:pb-12">
        {/* ── Row 1, Col 1: Heading + editorial copy ────────────────────── */}
        <div className="pt-6 md:pt-8 pb-4 md:pb-6 md:pr-16">
          {/* Line identifier */}
          <div className="flex items-center gap-3 mb-5">
            <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
              Line 01
            </span>
            <span className="flex-1 border-t border-transit-border" />
          </div>

          <h1
            className="text-[clamp(2.4rem,3.2vw,3.75rem)] font-black leading-[1.05] text-transit-periwinkle"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            Claim your
            <br />
            <span className="text-transit-mint">instance.</span>
          </h1>

          <p className="text-transit-muted text-sm leading-relaxed mt-4 max-w-xs">
            First account claims the workspace. Your artifacts, your rules.
          </p>
        </div>

        {/* ── Row 1, Col 2: Empty — space above form ────────────────────── */}
        <div className="hidden md:block" />

        {/* ── Row 2, Cols 1+2: Route line (full-width hero) ─────────────── */}
        <div className="col-span-full py-1">
          <RouteLineHero />
        </div>

        {/* ── Row 3, Col 1: Below-origin context ────────────────────────── */}
        <div className="pt-4 md:pt-6 md:pr-16 order-last md:order-none">
          <p className="text-xs text-transit-muted">
            Already have an account?{" "}
            <a href="/login" className="text-transit-mint hover:underline">
              Log in
            </a>
          </p>
        </div>

        {/* ── Row 3, Col 2: Form at destination ─────────────────────────── */}
        {/*
         * This column's left edge aligns with the destination dot above.
         * The first form field label ("Name") sits directly below the dot.
         */}
        <div className="pt-5">
          {/* Destination marker — echoes the route line's arrival point */}
          <div className="flex items-center gap-2.5 mb-5">
            <span className="w-2.5 h-2.5 rounded-full bg-transit-mint ring-4 ring-transit-mint/20 flex-shrink-0" />
            <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-mint">
              Destination Workspace
            </span>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 w-full max-w-md"
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
              className="mt-1 h-12 text-base"
            >
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="text-xs text-transit-muted mt-5">
            First account becomes the owner automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
