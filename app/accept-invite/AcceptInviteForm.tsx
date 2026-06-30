"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/transit/Wordmark";
import { Button } from "@/components/transit/Button";
import { Field } from "@/components/transit/Field";
import { authClient } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Background grid — 48-px transit-map paper.
// ---------------------------------------------------------------------------
function TransitGrid() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="agrid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#292e42" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#agrid)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// RouteLineHero — accept-invite variant.
//
// The workspace (origin, periwinkle) extends an invitation that reaches you
// (destination, mint) for the first time.  GSAP draws left-to-right on mount,
// same cadence as the setup screen.  Workspace name appears below the origin.
// Sentinel data-route-ready="1" on <html> fires when the animation is done.
// ---------------------------------------------------------------------------
function RouteLineHero({ workspaceName }: { workspaceName: string }) {
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

  // Truncate long workspace names for the SVG label.
  const label = workspaceName.length > 18 ? workspaceName.slice(0, 16) + "…" : workspaceName;

  return (
    <svg
      width="100%"
      height="80"
      viewBox="0 0 1200 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="aRouteGrad"
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

      {/* Origin station — periwinkle. The workspace that sent the invite. */}
      <circle cx="20" cy="40" r="13" fill="#1a1b26" stroke="#c0caf5" strokeWidth="4" />
      <circle cx="20" cy="40" r="6" fill="#c0caf5" />

      {/* Route line — GSAP draws left-to-right; the invitation reaching you. */}
      <path
        ref={lineRef}
        d="M20,40 L746,40"
        stroke="url(#aRouteGrad)"
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

      {/* Workspace name below origin */}
      <text
        x="20"
        y="68"
        fontSize={11}
        fill="#c0caf5"
        fontFamily="monospace"
        textAnchor="middle"
        fontWeight="bold"
      >
        {label}
      </text>
      {/* No label under destination: the form IS the destination. */}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// AcceptInviteForm
// ---------------------------------------------------------------------------
type Props = {
  token: string;
  email: string;
  workspaceName: string;
  role: string | null;
};

export function AcceptInviteForm({ token, email, workspaceName, role }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Step 1: Create the account. Better Auth auto-signs-in on signup.
      const signUpResult = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (signUpResult.error) {
        setError(signUpResult.error.message ?? "Could not create account. Try again.");
        return;
      }

      // Step 2: Accept the invitation. Requires an active session (just created above).
      const invResult = await authClient.organization.acceptInvitation({
        invitationId: token,
      });

      if (invResult.error) {
        setError(invResult.error.message ?? "Could not join the workspace.");
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

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Member";

  return (
    <div className="transit-canvas relative min-h-screen flex flex-col bg-transit-canvas text-transit-periwinkle overflow-hidden">
      <TransitGrid />

      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-12 pt-8 pb-4">
        <Wordmark size="md" />
        <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-transit-muted">
          Boarding
        </span>
      </nav>

      {/* ── Main composition ─────────────────────────────────────────────── */}
      {/*
       * CSS grid: 62% / 38%, three rows (heading / route / form).
       * The workspace (origin, periwinkle) extends an invitation line that
       * terminates at the destination dot — directly above the first form field.
       */}
      <div
        className="relative z-10 flex-1"
        style={{
          display: "grid",
          gridTemplateColumns: "62% 38%",
          gridTemplateRows: "auto auto 1fr",
          paddingLeft: "3rem",
          paddingRight: "3rem",
          paddingBottom: "3rem",
        }}
      >
        {/* ── Row 1, Col 1: Heading + context ───────────────────────────── */}
        <div className="pt-8 pb-6 pr-16">
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
            <span className="text-transit-mint">seat.</span>
          </h1>

          <p className="text-transit-muted text-sm leading-relaxed mt-4 max-w-xs">
            You have been invited to{" "}
            <span className="text-transit-periwinkle">{workspaceName}</span>
            {" "}as{" "}
            <span className="text-transit-periwinkle">{roleLabel}</span>.
            Complete your profile to board.
          </p>
        </div>

        {/* ── Row 1, Col 2: Empty — space above form ────────────────────── */}
        <div />

        {/* ── Row 2, Cols 1+2: Route line (full-width hero) ─────────────── */}
        <div style={{ gridColumn: "1 / -1" }} className="py-1">
          <RouteLineHero workspaceName={workspaceName} />
        </div>

        {/* ── Row 3, Col 1: Below-origin context ────────────────────────── */}
        <div className="pt-6 pr-16">
          <p className="text-xs text-transit-muted">
            Invited as{" "}
            <span className="font-mono text-transit-periwinkle/80">{email}</span>.
            The seat is reserved for this address.
          </p>
        </div>

        {/* ── Row 3, Col 2: Form at destination ─────────────────────────── */}
        <div className="pt-5">
          {/* Destination marker */}
          <div className="flex items-center gap-2.5 mb-5">
            <span className="w-2.5 h-2.5 rounded-full bg-transit-mint ring-4 ring-transit-mint/20 flex-shrink-0" />
            <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-mint">
              Your Station
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
            {/* Email is pre-filled and locked: the invitation is for this address. */}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={() => {}}
              readOnly
              hint="Locked to your invitation address"
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
              {loading ? "Boarding..." : "Board the line"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
