import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getLinkBySlug } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyAccessToken } from "@/lib/token";
import { gateState } from "@/lib/gate-view";

export default async function ViewerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await getLinkBySlug(getStore(), slug);
  if (!link) notFound();

  const cookieStore = await cookies();
  const claim = verifyAccessToken(cookieStore.get(`sentou_${slug}`)?.value);
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
  return (
    <main style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <iframe title="artifact" src={`/artifact/${slug}`} sandbox="allow-scripts" style={{ flex: 1, width: "100%", border: "none" }} />
    </main>
  );
}
