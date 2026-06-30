// POST /api/keys/revoke — disable an API key owned by the current user.
//
// Ownership is strict: a user can only revoke their own keys.
// No admin bypass — API keys are personal credentials.
// Returns 404 (not 403) on mismatch to avoid confirming key existence.
import { eq, and } from "drizzle-orm";
import { getActor } from "@/lib/auth-session";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export async function POST(req: Request) {
  const actor = await getActor(req);
  if (!actor) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id || typeof id !== "string") {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();

  // Single atomic UPDATE scoped to this user — no separate fetch needed.
  // If the key doesn't exist or belongs to someone else, changes === 0 → 404.
  const result = db
    .update(schema.apiKey)
    .set({ enabled: false })
    .where(and(eq(schema.apiKey.id, id), eq(schema.apiKey.userId, actor.userId)))
    .run();

  if (result.changes === 0) {
    return Response.json({ error: "key not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
