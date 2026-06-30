import { revokeLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { requireOwner } from "@/lib/owner";
import { isAdmin, type Actor } from "@/lib/auth-session";

export async function POST(req: Request) {
  let actor: Actor | null;
  try {
    actor = await requireOwner(req);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  // Fetch the link first for ownership enforcement.
  const link = await getStore().get(id);
  if (!link) return Response.json({ error: "link not found" }, { status: 404 });

  const ownerId = link.ownerUserId ?? null;
  if (actor) {
    const authorized = (ownerId !== null && actor.userId === ownerId) || isAdmin(actor);
    if (!authorized) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
  }

  try {
    await revokeLink(getStore(), id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "link not found" }, { status: 404 });
  }
}
