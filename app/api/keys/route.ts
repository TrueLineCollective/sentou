import { eq, and, count } from "drizzle-orm";
import { getActor, createApiKey } from "@/lib/auth-session";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

// Maximum number of active API keys a single user may hold at once.
export const MAX_ACTIVE_KEYS = 20;

// POST /api/keys — create a new API key for the authenticated user.
// Requires a valid session cookie or existing API key (via getActor).
// Returns { key, prefix, name } exactly once; the plaintext key is not stored.
export async function POST(req: Request) {
  const actor = await getActor(req);
  if (!actor) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Enforce per-user cap on active keys to prevent unbounded accumulation.
  const db = getDb();
  const capRow = db
    .select({ activeCount: count() })
    .from(schema.apiKey)
    .where(and(eq(schema.apiKey.userId, actor.userId), eq(schema.apiKey.enabled, true)))
    .get();
  if ((capRow?.activeCount ?? 0) >= MAX_ACTIVE_KEYS) {
    return Response.json(
      { error: `Active key limit reached (${MAX_ACTIVE_KEYS}). Revoke an existing key before creating a new one.` },
      { status: 422 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { name = "API Key" } = body as { name?: string };

  const result = createApiKey(actor.userId, String(name).slice(0, 255));
  return Response.json(result);
}
