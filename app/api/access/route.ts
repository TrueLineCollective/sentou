import { getLinkBySlug, recordViewer } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";
import { evaluateAccess } from "@/lib/access";
import { signAccessToken } from "@/lib/token";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { slug, email } = body as { slug?: string; email?: string };
  if (!slug || !email) return Response.json({ error: "slug and email are required" }, { status: 400 });

  const link = await getLinkBySlug(getStore(), slug);
  if (!link) return Response.json({ error: "not found" }, { status: 404 });

  const decision = evaluateAccess(link, { email, now: new Date().toISOString() });
  if (!decision.allowed) return Response.json({ error: decision.reason }, { status: 403 });

  await recordViewer(getStore(), link.id, email);
  const token = signAccessToken({ linkId: link.id, email });
  const res = Response.json({ ok: true, url: linkUrl(slug) });
  res.headers.set(
    "set-cookie",
    `sentou_${slug}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`,
  );
  return res;
}
