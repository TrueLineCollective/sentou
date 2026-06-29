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

  if (state === "denied") {
    return <main style={{ padding: 48, fontFamily: "system-ui" }}>This link is no longer available.</main>;
  }
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
        <main style={{ padding: 48, fontFamily: "system-ui", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20 }}>Enter the code we emailed you</h1>
          <form method="POST" action={`/api/access/verify?slug=${slug}`} style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="email" value={verifyClaim.email} />
            <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code" required placeholder="6-digit code" style={{ flex: 1, padding: 8 }} />
            <button type="submit" style={{ padding: "8px 16px" }}>Verify</button>
          </form>
          {consoleMode && (
            <p style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
              Local test mode: no email sender is configured, so your code was printed to the server console.
            </p>
          )}
        </main>
      );
    }
    // Step one (and the whole flow for a non-verifying gated link): collect the email.
    return (
      <main style={{ padding: 48, fontFamily: "system-ui", maxWidth: 420 }}>
        <h1 style={{ fontSize: 20 }}>Enter your email to view this</h1>
        <form method="POST" action={`/api/access?slug=${slug}`} style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input type="email" name="email" required placeholder="you@company.com" style={{ flex: 1, padding: 8 }} />
          <input type="hidden" name="slug" value={slug} />
          <button type="submit" style={{ padding: "8px 16px" }}>{link.verifyEmail ? "Send code" : "View"}</button>
        </form>
      </main>
    );
  }
  const tracking = trackingContext(link, claim);
  const iframe = (
    <iframe title="artifact" src={`/artifact/${slug}`} sandbox="allow-scripts" style={{ flex: 1, width: "100%", border: "none" }} />
  );
  return (
    <main style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      {tracking.track && (
        // Recipient-facing disclosure: be honest that an opened link is recorded. The sender,
        // not Sentou, is responsible for whatever they do with it.
        <div style={{ padding: "6px 12px", fontSize: 12, color: "#555", background: "#f5f5f7", borderBottom: "1px solid #e5e5ea", fontFamily: "system-ui" }}>
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
