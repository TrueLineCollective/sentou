import { createLink, OPEN_GATE } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const html = typeof body.html === "string" ? body.html : "";
  if (!html.trim()) return Response.json({ error: "html is required" }, { status: 400 });
  const gate = {
    ...OPEN_GATE,
    requireEmail: body.requireEmail === true,
    allowedDomains: Array.isArray(body.allowedDomains) ? body.allowedDomains : null,
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
  };
  const link = await createLink(getStore(), html, gate);
  return Response.json({ id: link.id, slug: link.slug, url: linkUrl(link.slug), version: 1 });
}
