import { getStore } from "@/lib/server-store";
import { aggregate } from "@/lib/stats";
import { requireOwner } from "@/lib/owner";
import { isAdmin, type Actor } from "@/lib/auth-session";

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

  // Ownership enforcement: when a real actor is present, allow only if the
  // actor owns this link or holds an elevated role. A null-owner (legacy/
  // imported) link is accessible only to admins — not to ordinary members.
  // When there is no actor (dev/local open mode), allow all.
  const ownerId = link.ownerUserId ?? null;
  if (actor) {
    const authorized = (ownerId !== null && actor.userId === ownerId) || isAdmin(actor);
    if (!authorized) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const agg = aggregate(link.events);
  return Response.json({ linkId: id, ...agg });
}
