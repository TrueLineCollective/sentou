import { createLink } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const html = typeof body.html === "string" ? body.html : "";
  if (!html.trim()) return Response.json({ error: "html is required" }, { status: 400 });
  const link = await createLink(getStore(), html);
  return Response.json({ id: link.id, slug: link.slug, url: linkUrl(link.slug), version: 1 });
}
