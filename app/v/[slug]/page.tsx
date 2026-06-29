import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getLinkBySlug } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyAccessToken } from "@/lib/token";
import { cookieName } from "@/lib/cookies";
import { gateState } from "@/lib/gate-view";
import { trackingContext } from "@/lib/tracking-context";

export default async function ViewerPage({ params }: { params: Promise<{ slug: string }> }) {
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
    return (
      <main style={{ padding: 48, fontFamily: "system-ui", maxWidth: 420 }}>
        <h1 style={{ fontSize: 20 }}>Enter your email to view this</h1>
        <form method="POST" action={`/api/access?slug=${slug}`} style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input type="email" name="email" required placeholder="you@company.com" style={{ flex: 1, padding: 8 }} />
          <input type="hidden" name="slug" value={slug} />
          <button type="submit" style={{ padding: "8px 16px" }}>View</button>
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
