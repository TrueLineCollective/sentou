import { getStore } from "@/lib/server-store";
import { aggregate } from "@/lib/stats";
import { requireOwner } from "@/lib/owner";
import type { Actor } from "@/lib/auth-session";

export async function GET(req: Request) {
  let actor: Actor | null;
  try {
    actor = await requireOwner(req);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const link = await getStore().get(id);
  if (!link) return Response.json({ error: "not found" }, { status: 404 });

  // Ownership enforcement: when a real actor is present AND the link has a
  // known owner, allow only if the actor owns it or holds an elevated role.
  const ownerId = link.ownerUserId ?? null;
  if (actor && ownerId) {
    if (actor.userId !== ownerId && actor.role !== "owner" && actor.role !== "admin") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const agg = aggregate(link.events);
  return Response.json({ linkId: id, ...agg });
}
