import { purgeLinkData, eraseViewer } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { requireOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isAdmin, type Actor } from "@/lib/auth-session";

// Deletion endpoint (GDPR Art. 17). POST { id } purges all recipient data for a link; POST
// { id, email } erases a single subject. Owner-authed, like the other write endpoints.
export async function POST(req: Request) {
  let actor: Actor | null;
  try {
    actor = await requireOwner(req);
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`forget:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return Response.json({ error: "rate limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });

  const body = await req.json().catch(() => ({}));
  const { id, email } = body as { id?: string; email?: string };
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
    const updated = email ? await eraseViewer(getStore(), id, email) : await purgeLinkData(getStore(), id);
    return Response.json({ ok: true, id: updated.id, viewers: updated.viewers.length, events: updated.events.length });
  } catch {
    return Response.json({ error: "link not found" }, { status: 404 });
  }
}
