import { getActor, createApiKey } from "@/lib/auth-session";

// POST /api/keys — create a new API key for the authenticated user.
// Requires a valid session cookie or existing API key (via getActor).
// Returns { key, prefix, name } exactly once; the plaintext key is not stored.
export async function POST(req: Request) {
  const actor = await getActor(req);
  if (!actor) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { name = "API Key" } = body as { name?: string };

  const result = createApiKey(actor.userId, String(name).slice(0, 255));
  return Response.json(result);
}
