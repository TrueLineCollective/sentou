import { getLinkBySlug, recordViewer } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";
import { evaluateAccess } from "@/lib/access";
import { openVerify } from "@/lib/verify";
import { signAccessToken } from "@/lib/token";
import { cookieName, verifyCookieName } from "@/lib/cookies";

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return decodeURIComponent(v.join("=")); }
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { slug, email, code } = body as { slug?: string; email?: string; code?: string };
  if (!slug || !email || !code) return Response.json({ error: "slug, email, code required" }, { status: 400 });
  const link = await getLinkBySlug(getStore(), slug);
  if (!link) return Response.json({ error: "not found" }, { status: 404 });

  const claim = openVerify(readCookie(req, verifyCookieName(slug)));
  const ok = !!claim && claim.slug === slug && claim.email === email && Date.now() < claim.exp && claim.code === String(code);
  if (!ok) return Response.json({ error: "invalid or expired code" }, { status: 401 });
  if (!evaluateAccess(link, { email, now: new Date().toISOString() }).allowed) return Response.json({ error: "denied" }, { status: 403 });

  await recordViewer(getStore(), link.id, email);
  const token = signAccessToken({ linkId: link.id, email });
  const res = Response.json({ ok: true, url: linkUrl(slug) });
  res.headers.set("set-cookie", `${cookieName(slug)}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return res;
}
