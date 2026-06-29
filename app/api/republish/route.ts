import { republish } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";
import { requireOwner } from "@/lib/owner";
import type { Actor } from "@/lib/auth-session";

export async function POST(req: Request) {
  let actor: Actor | null;
  try {
    actor = await requireOwner(req);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (Number(req.headers.get("content-length") || 0) > 5_000_000) {
    return Response.json({ error: "request too large" }, { status: 413 });
  }
  const body = await req.json().catch(() => ({}));
  const { id, html } = body as { id?: string; html?: string };
  if (!id || typeof html !== "string" || !html.trim()) {
    return Response.json({ error: "id and html are required" }, { status: 400 });
  }

  // Fetch the link first for ownership enforcement.
  const link = await getStore().get(id);
  if (!link) return Response.json({ error: "link not found" }, { status: 404 });

  const ownerId = link.ownerUserId ?? null;
  if (actor && ownerId) {
    if (actor.userId !== ownerId && actor.role !== "owner" && actor.role !== "admin") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
  }

  try {
    const updated = await republish(getStore(), id, html);
    return Response.json({
      id: updated.id, slug: updated.slug, url: linkUrl(updated.slug), version: updated.versions.length,
    });
  } catch {
    return Response.json({ error: "link not found" }, { status: 404 });
  }
}
