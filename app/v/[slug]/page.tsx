import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getLinkBySlug } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyAccessToken } from "@/lib/token";
import { cookieName, verifyCookieName } from "@/lib/cookies";
import { openVerify } from "@/lib/verify";
import { emailConfigured } from "@/lib/email";
import { gateState } from "@/lib/gate-view";
import { trackingContext } from "@/lib/tracking-context";
import { Wordmark } from "@/components/transit/Wordmark";

// ---------------------------------------------------------------------------
// Blueprint grid — 48-px transit-map paper, same pattern as setup/login.
// ---------------------------------------------------------------------------
function TransitGrid() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 w-full h-full z-0"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="vgrid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#292e42" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#vgrid)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// CheckpointLine — recipient variant of the route-line hero.
//
// Originates at SENDER (periwinkle, left) and terminates at the CHECKPOINT
// (mint) at the 62% mark — directly above the form column.  No GSAP: server
// render, resting state is fully drawn.
//
// gradId must be unique per page render; two gate states live on the same
// origin URL so they need distinct IDs to avoid SVG gradient conflicts.
// ---------------------------------------------------------------------------
function CheckpointLine({ gradId }: { gradId: string }) {
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
        <linearGradient id={gradId} x1="20" y1="40" x2="746" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c0caf5" />
          <stop offset="100%" stopColor="#7ee787" />
        </linearGradient>
      </defs>
      <text x="20" y="16" fontSize={9} fill="#828bbf" fontFamily="monospace" letterSpacing={2} textAnchor="middle">SENT</text>
      <text x="746" y="16" fontSize={9} fill="#828bbf" fontFamily="monospace" letterSpacing={2} textAnchor="middle">CHECKPOINT</text>
      {/* Sender station — periwinkle */}
      <circle cx="20" cy="40" r="13" fill="#1a1b26" stroke="#c0caf5" strokeWidth="4" />
      <circle cx="20" cy="40" r="6" fill="#c0caf5" />
      {/* Route line */}
      <path d="M20,40 L746,40" stroke={`url(#${gradId})`} strokeWidth="7" strokeLinecap="round" />
      {/* Checkpoint station — mint */}
      <circle cx="746" cy="40" r="15" fill="#1a1b26" stroke="#7ee787" strokeWidth="4" />
      <circle cx="746" cy="40" r="7" fill="#7ee787" />
      <text x="20" y="68" fontSize={11} fill="#c0caf5" fontFamily="monospace" textAnchor="middle" fontWeight="bold">SENDER</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ClosedLine — denied / revoked / expired state.
// Dashed muted route, X mark at the closed terminus.
// ---------------------------------------------------------------------------
function ClosedLine() {
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
      <text x="20" y="16" fontSize={9} fill="#828bbf" fontFamily="monospace" letterSpacing={2} textAnchor="middle">ORIGIN</text>
      <text x="400" y="16" fontSize={9} fill="#828bbf" fontFamily="monospace" letterSpacing={2} textAnchor="middle">CLOSED</text>
      <circle cx="20" cy="40" r="13" fill="#1a1b26" stroke="#828bbf" strokeWidth="4" />
      <circle cx="20" cy="40" r="6" fill="#828bbf" />
      <path d="M20,40 L400,40" stroke="#292e42" strokeWidth="7" strokeLinecap="round" strokeDasharray="12 8" />
      <circle cx="400" cy="40" r="15" fill="#1a1b26" stroke="#828bbf" strokeWidth="4" />
      <line x1="392" y1="32" x2="408" y2="48" stroke="#828bbf" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="408" y1="32" x2="392" y2="48" stroke="#828bbf" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// Shared class strings for gate form controls.
// Field and Button Transit components use hooks; this is a server component.
const inputCls =
  "h-11 w-full px-3 rounded-lg bg-transit-surface border border-transit-border " +
  "text-transit-periwinkle placeholder:text-transit-muted text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-transit-mint focus:border-transit-mint " +
  "transition-colors duration-150";

const submitCls =
  "h-12 w-full rounded-lg bg-transit-mint text-transit-canvas font-bold text-base " +
  "hover:bg-[#6dd876] focus:outline-none focus:ring-2 focus:ring-transit-mint " +
  "focus:ring-offset-2 focus:ring-offset-transit-canvas transition-all duration-150";

export default async function ViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const link = await getLinkBySlug(getStore(), slug);
  if (!link) notFound();

  const cookieStore = await cookies();
  const claim = verifyAccessToken(cookieStore.get(cookieName(slug))?.value);
  const state = gateState(link, claim);

  // ── Denied: revoked or expired ─────────────────────────────────────────────
  if (state === "denied") {
    return (
      <main className="transit-canvas relative min-h-dvh flex flex-col bg-transit-canvas text-transit-periwinkle overflow-hidden">
        <TransitGrid />
        <nav className="relative z-10 flex items-center justify-between px-4 md:px-12 pt-6 md:pt-8 pb-4">
          <Wordmark size="md" />
          <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-transit-muted">
            Service Status
          </span>
        </nav>
        <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-[62%_38%] md:grid-rows-[auto_auto_1fr] px-4 md:px-12 pb-4 md:pb-12">
          <div className="pt-6 md:pt-8 pb-4 md:pb-6 md:pr-16">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
                Line terminated
              </span>
              <span className="flex-1 border-t border-transit-border" aria-hidden="true" />
            </div>
            <h1
              className="text-[clamp(2.4rem,3.2vw,3.75rem)] font-black leading-[1.05] text-transit-periwinkle"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Line<br />
              <span className="text-transit-muted">closed.</span>
            </h1>
            <p className="text-transit-muted text-sm leading-relaxed mt-4 max-w-xs">
              This route is no longer in service. The link may have expired or been revoked.
            </p>
          </div>
          <div className="hidden md:block" />
          <div className="col-span-full py-1">
            <ClosedLine />
          </div>
          <div className="hidden md:block" />
          <div className="hidden md:block" />
        </div>
      </main>
    );
  }

  // ── Gated: email gate or code verification step ────────────────────────────
  if (state === "form") {
    const sp = searchParams ? await searchParams : {};
    const step = typeof sp.step === "string" ? sp.step : undefined;
    // Step two of verification: the access route emailed a code and bounced us here with
    // ?step=code, carrying the verify cookie. The address rides in that sealed cookie (never in
    // the URL), so read it back here. A missing/expired cookie just falls through to step one.
    const verifyClaim = openVerify(cookieStore.get(verifyCookieName(slug))?.value);
    if (link.verifyEmail && step === "code" && verifyClaim && verifyClaim.slug === slug) {
      const consoleMode = !emailConfigured();
      return (
        <main className="transit-canvas relative min-h-dvh flex flex-col bg-transit-canvas text-transit-periwinkle overflow-hidden">
          <TransitGrid />
          <nav className="relative z-10 flex items-center justify-between px-4 md:px-12 pt-6 md:pt-8 pb-4">
            <Wordmark size="md" />
            <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-transit-muted">
              Verify
            </span>
          </nav>
          <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-[62%_38%] md:grid-rows-[auto_auto_1fr] px-4 md:px-12 pb-4 md:pb-12">
            {/* Row 1, Col 1: Heading */}
            <div className="pt-6 md:pt-8 pb-4 md:pb-6 md:pr-16">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
                  Checkpoint verify
                </span>
                <span className="flex-1 border-t border-transit-border" aria-hidden="true" />
              </div>
              <h1
                className="text-[clamp(2.4rem,3.2vw,3.75rem)] font-black leading-[1.05] text-transit-periwinkle"
                style={{ fontFamily: "var(--font-inter)" }}
              >
                Check your<br />
                <span className="text-transit-mint">inbox.</span>
              </h1>
              <p className="text-transit-muted text-sm leading-relaxed mt-4 max-w-xs">
                Enter the code we sent to your email to continue.
              </p>
            </div>
            {/* Row 1, Col 2: empty — space above form */}
            <div className="hidden md:block" />
            {/* Row 2, full width: Route line */}
            <div className="col-span-full py-1">
              <CheckpointLine gradId="cpGradCode" />
            </div>
            {/* Row 3, Col 1: context below origin */}
            <div className="pt-4 md:pt-6 md:pr-16 order-last md:order-none">
              <p className="text-xs text-transit-muted">
                Code not arriving? Check your spam folder.
              </p>
            </div>
            {/* Row 3, Col 2: form at checkpoint */}
            <div className="pt-5">
              <div className="flex items-center gap-2.5 mb-5">
                <span
                  className="w-2.5 h-2.5 rounded-full bg-transit-mint ring-4 ring-transit-mint/20 flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-mint">
                  Checkpoint
                </span>
              </div>
              <form
                method="POST"
                action={`/api/access/verify?slug=${slug}`}
                className="flex flex-col gap-5 w-full"
                style={{ maxWidth: 380 }}
              >
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="email" value={verifyClaim.email} />
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="gate-code"
                    className="text-sm font-medium text-transit-periwinkle"
                  >
                    Verification code
                  </label>
                  <input
                    id="gate-code"
                    type="text"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    placeholder="6-digit code"
                    className={inputCls}
                  />
                </div>
                <button type="submit" className={submitCls}>
                  Verify
                </button>
              </form>
              {consoleMode && (
                <p className="text-xs text-transit-muted mt-3">
                  Local test mode: check the server console for your code.
                </p>
              )}
            </div>
          </div>
        </main>
      );
    }
    // Step one (and the whole flow for a non-verifying gated link): collect the email.
    return (
      <main className="transit-canvas relative min-h-dvh flex flex-col bg-transit-canvas text-transit-periwinkle overflow-hidden">
        <TransitGrid />
        <nav className="relative z-10 flex items-center justify-between px-4 md:px-12 pt-6 md:pt-8 pb-4">
          <Wordmark size="md" />
          <span className="text-[10px] font-mono tracking-[0.28em] uppercase text-transit-muted">
            Checkpoint
          </span>
        </nav>
        <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-[62%_38%] md:grid-rows-[auto_auto_1fr] px-4 md:px-12 pb-4 md:pb-12">
          {/* Row 1, Col 1: Heading */}
          <div className="pt-6 md:pt-8 pb-4 md:pb-6 md:pr-16">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
                Gated link
              </span>
              <span className="flex-1 border-t border-transit-border" aria-hidden="true" />
            </div>
            <h1
              className="text-[clamp(2.4rem,3.2vw,3.75rem)] font-black leading-[1.05] text-transit-periwinkle"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              One stop<br />
              <span className="text-transit-mint">to go.</span>
            </h1>
            <p className="text-transit-muted text-sm leading-relaxed mt-4 max-w-xs">
              This link is gated. Enter your email to continue to the shared content.
            </p>
          </div>
          {/* Row 1, Col 2: empty */}
          <div className="hidden md:block" />
          {/* Row 2, full width: Route line */}
          <div className="col-span-full py-1">
            <CheckpointLine gradId="cpGradEmail" />
          </div>
          {/* Row 3, Col 1: context below origin */}
          <div className="pt-4 md:pt-6 md:pr-16 order-last md:order-none">
            <p className="text-xs text-transit-muted">
              Shared via Sentou. Your email is used only to control access.
            </p>
          </div>
          {/* Row 3, Col 2: form at checkpoint */}
          <div className="pt-5">
            <div className="flex items-center gap-2.5 mb-5">
              <span
                className="w-2.5 h-2.5 rounded-full bg-transit-mint ring-4 ring-transit-mint/20 flex-shrink-0"
                aria-hidden="true"
              />
              <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-mint">
                Gate
              </span>
            </div>
            <form
              method="POST"
              action={`/api/access?slug=${slug}`}
              className="flex flex-col gap-5 w-full"
              style={{ maxWidth: 380 }}
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="gate-email"
                  className="text-sm font-medium text-transit-periwinkle"
                >
                  Email
                </label>
                <input
                  id="gate-email"
                  type="email"
                  name="email"
                  required
                  placeholder="you@company.com"
                  autoComplete="email"
                  className={inputCls}
                />
              </div>
              <input type="hidden" name="slug" value={slug} />
              <button type="submit" className={submitCls}>
                {link.verifyEmail ? "Send code" : "View"}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // ── Viewer: artifact in sandboxed iframe ───────────────────────────────────
  // STRUCTURE: main's DIRECT children must be [maybe-notice-div, iframe, maybe-script].
  // No extra wrappers here — tests verify direct siblings to prove sandbox isolation.
  const tracking = trackingContext(link, claim);
  const iframe = (
    <iframe
      title="artifact"
      src={`/artifact/${slug}`}
      sandbox="allow-scripts"
      style={{ flex: 1, width: "100%", border: "none" }}
    />
  );
  return (
    <main
      className="transit-canvas bg-transit-canvas"
      style={{ height: "100dvh", display: "flex", flexDirection: "column" }}
    >
      {tracking.track && (
        // Recipient-facing disclosure: be honest that an opened link is recorded. The sender,
        // not Sentou, is responsible for whatever they do with it.
        <div className="flex-shrink-0 px-4 py-2 text-[11px] text-transit-muted border-b border-transit-border bg-transit-surface">
          The sender of this link can see when it is opened and how long it stays open.
        </div>
      )}
      {iframe}
      {tracking.track && (
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){var t=${JSON.stringify(tracking.token)},s=Date.now();` +
              `function send(type,extra){try{navigator.sendBeacon('/api/track',new Blob([JSON.stringify(Object.assign({token:t,type:type},extra||{}))],{type:'application/json'}))}catch(e){}}` +
              `send('open');` +
              `addEventListener('pagehide',function(){send('close',{dwellMs:Date.now()-s})});` +
              `document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')send('close',{dwellMs:Date.now()-s})});` +
              `})();`,
          }}
        />
      )}
    </main>
  );
}
