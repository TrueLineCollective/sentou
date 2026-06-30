"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/transit/Wordmark";
import { Button } from "@/components/transit/Button";
import { Field } from "@/components/transit/Field";
import { authClient } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Route Line SVG — the Transit motif: periwinkle line drawn toward mint
// ---------------------------------------------------------------------------
function RouteLine() {
  const lineRef = useRef<SVGLineElement>(null);
  const topDotRef = useRef<SVGCircleElement>(null);
  const bottomDotRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const line = lineRef.current;
    const topDot = topDotRef.current;
    const bottomDot = bottomDotRef.current;
    if (!line || !topDot || !bottomDot) return;

    // Reduced-motion guard: leave the fully-drawn resting state untouched.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Backgrounded tabs throttle requestAnimationFrame, which GSAP's ticker
    // rides on. Starting the draw-in here would strand the line half-drawn
    // (and leave a blank spine in any screenshot). Keep the visible resting
    // state instead and let it animate next time the page loads in focus.
    if (document.hidden) return;

    let cancelled = false;
    let cleanup = () => {};

    // Dynamically import GSAP so it never runs SSR.
    import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      const length = line.getTotalLength?.() ?? 280;
      gsap.set(line, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });
      gsap.set([topDot, bottomDot], { opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
      tl.to(line, { strokeDashoffset: 0, duration: 1.1 })
        .to(topDot, { opacity: 1, duration: 0.2 }, "-=0.9")
        .to(bottomDot, { opacity: 1, duration: 0.2 }, "-=0.2");

      // If the tab is hidden mid-draw, rAF pauses and the line would strand.
      // Snap to the finished state so it is never left half-drawn.
      const onVisibility = () => {
        if (document.hidden) tl.progress(1);
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
      width="40"
      height="320"
      viewBox="0 0 40 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Top station dot — periwinkle */}
      <circle
        ref={topDotRef}
        cx="20"
        cy="20"
        r="7"
        fill="#c0caf5"
        stroke="#1a1b26"
        strokeWidth="3"
      />
      {/* Route line periwinkle -> mint via linearGradient */}
      <defs>
        <linearGradient id="routeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c0caf5" />
          <stop offset="100%" stopColor="#7ee787" />
        </linearGradient>
      </defs>
      <line
        ref={lineRef}
        x1="20"
        y1="20"
        x2="20"
        y2="300"
        stroke="url(#routeGrad)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Bottom station dot — mint */}
      <circle
        ref={bottomDotRef}
        cx="20"
        cy="300"
        r="7"
        fill="#7ee787"
        stroke="#1a1b26"
        strokeWidth="3"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Setup form
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
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });

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
    <div className="transit-canvas flex min-h-screen bg-transit-canvas text-transit-periwinkle">
      {/* Left brand panel — 42% */}
      <div className="hidden lg:flex flex-col w-[42%] min-h-screen bg-transit-surface border-r border-transit-border px-12 py-10">
        {/* Wordmark top-left */}
        <Wordmark size="lg" />

        {/* Route line + editorial copy — centered vertically */}
        <div className="flex flex-1 items-center gap-8">
          <RouteLine />
          <div className="flex flex-col gap-4">
            <h1
              className="text-4xl font-black leading-tight text-transit-periwinkle"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Claim your
              <br />
              <span className="text-transit-mint">instance.</span>
            </h1>
            <p className="text-transit-muted text-base leading-relaxed max-w-xs">
              One owner. One workspace. Your artifacts, your rules.
            </p>
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-xs text-transit-muted">
          First account becomes the owner automatically.
        </p>
      </div>

      {/* Right form panel — 58% */}
      <div className="flex flex-1 flex-col justify-center px-8 sm:px-16 lg:px-20 py-12">
        {/* Mobile wordmark */}
        <div className="lg:hidden mb-8">
          <Wordmark size="lg" />
        </div>

        <div className="w-full max-w-md">
          {/* Elevated surface card */}
          <div className="bg-transit-elevated border border-transit-border rounded-xl p-8 shadow-xl">
            <h2
              className="text-2xl font-black text-transit-periwinkle mb-2"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Create owner account
            </h2>
            <p className="text-transit-muted text-sm mb-8">
              You are the first user. This account owns the workspace.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
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
          </div>

          <p className="text-center text-xs text-transit-muted mt-6">
            Already have an account?{" "}
            <a href="/login" className="text-transit-mint hover:underline">
              Log in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
