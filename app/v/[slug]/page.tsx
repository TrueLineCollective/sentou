import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getLinkBySlug } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyAccessToken } from "@/lib/token";
import { cookieName } from "@/lib/cookies";
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
    // Step two of verification: the access route emailed a code and bounced us
    // here with ?step=code&email=…, carrying the verify cookie. Collect the code.
    if (link.verifyEmail && step === "code") {
      const carriedEmail = typeof sp.email === "string" ? sp.email : "";
      return (
        <main style={{ padding: 48, fontFamily: "system-ui", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20 }}>Enter the code we emailed you</h1>
          <form method="POST" action={`/api/access/verify?slug=${slug}`} style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="email" value={carriedEmail} />
            <input type="text" name="code" inputMode="numeric" autoComplete="one-time-code" required placeholder="6-digit code" style={{ flex: 1, padding: 8 }} />
            <button type="submit" style={{ padding: "8px 16px" }}>Verify</button>
          </form>
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
      {tracking.track ? (
        <>
          {iframe}
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
        </>
      ) : (
        iframe
      )}
    </main>
  );
}
