"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/transit/Wordmark";
import { Button } from "@/components/transit/Button";
import { Field } from "@/components/transit/Field";
import { authClient } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Background grid — 48-px transit-map paper (matches setup and dashboard).
// ---------------------------------------------------------------------------
function TransitGrid() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="lgrid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#292e42" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#lgrid)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// RouteLineHero — login variant.
//
// The line is already fully drawn: you know this route.  No GSAP animation.
// Resting state: periwinkle origin (YOU) → mint destination (COMMAND).
// The destination dot sits at exactly 62% — above the first form field.
// ---------------------------------------------------------------------------
function RouteLineHero() {
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
        <linearGradient
          id="lRouteGrad"
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

      {/* Origin station — periwinkle. */}
      <circle cx="20" cy="40" r="13" fill="#1a1b26" stroke="#c0caf5" strokeWidth="4" />
      <circle cx="20" cy="40" r="6" fill="#c0caf5" />

      {/* Route line — already drawn; no animation on login. */}
      <path
        d="M20,40 L746,40"
        stroke="url(#lRouteGrad)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Destination station — mint. Already arrived. */}
      <circle cx="746" cy="40" r="15" fill="#1a1b26" stroke="#7ee787" strokeWidth="4" />
      <circle cx="746" cy="40" r="7" fill="#7ee787" />

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
// LoginForm
// ---------------------------------------------------------------------------
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Invalid credentials. Try again.");
        return;
      }
      router.push("/");
      router.refresh();
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
          Return
        </span>
      </nav>

      {/* ── Main composition ─────────────────────────────────────────────── */}
      {/*
       * 62% / 38% grid at md+, single column on mobile. The destination dot
       * sits at 62% — directly above the first form field on desktop.
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
            Back on the
            <br />
            <span className="text-transit-mint">line.</span>
          </h1>

          <p className="text-transit-muted text-sm leading-relaxed mt-4 max-w-xs">
            Your workspace is waiting.
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
            Access is invite-only.{" "}
            <span className="text-transit-muted/60">Contact your workspace admin.</span>
          </p>
        </div>

        {/* ── Row 3, Col 2: Form at destination ─────────────────────────── */}
        <div className="pt-5">
          {/* Destination marker — echoes the route line's arrival point */}
          <div className="flex items-center gap-2.5 mb-5">
            <span className="w-2.5 h-2.5 rounded-full bg-transit-mint ring-4 ring-transit-mint/20 flex-shrink-0" />
            <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-mint">
              Command
            </span>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 w-full max-w-md"
            noValidate
          >
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
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
