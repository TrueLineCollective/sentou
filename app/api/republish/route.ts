import { republish } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";
import { requireOwner } from "@/lib/owner";

export async function POST(req: Request) {
  if (!requireOwner(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, html } = body as { id?: string; html?: string };
  if (!id || typeof html !== "string" || !html.trim()) {
    return Response.json({ error: "id and html are required" }, { status: 400 });
  }
  try {
    const link = await republish(getStore(), id, html);
    return Response.json({
      id: link.id, slug: link.slug, url: linkUrl(link.slug), version: link.versions.length,
    });
  } catch {
    return Response.json({ error: "link not found" }, { status: 404 });
  }
}
