import { getLinkBySlug, currentHtml } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { evaluateAccess } from "@/lib/access";
import { verifyAccessToken } from "@/lib/token";

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await getLinkBySlug(getStore(), slug);
  if (!link) return new Response("Not found", { status: 404 });

  const claim = verifyAccessToken(readCookie(req, `sentou_${slug}`));
  const email = claim && claim.linkId === link.id ? claim.email : undefined;
  const decision = evaluateAccess(link, { email, now: new Date().toISOString() });
  if (!decision.allowed) {
    const status = decision.reason === "revoked" || decision.reason === "expired" ? 410 : 403;
    return new Response(`Access denied: ${decision.reason}`, {
      status,
      headers: { "cache-control": "no-store" },
    });
  }

  return new Response(currentHtml(link), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; frame-ancestors 'self'; sandbox allow-scripts",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
