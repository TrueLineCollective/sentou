import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

// GET — return current notification prefs for the authenticated user.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const db = getDb();
  const prefs = db
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, session.user.id))
    .get();

  return Response.json({
    emailOnOpen: prefs?.emailOnOpen ?? false,
    webhookUrl: prefs?.webhookUrl ?? null,
  });
}

// POST — upsert notification prefs for the authenticated user.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  let body: { emailOnOpen?: unknown; webhookUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const emailOnOpen = !!body.emailOnOpen;

  // Normalize webhookUrl: empty string or missing → null; validate scheme if provided.
  let webhookUrl: string | null = null;
  if (typeof body.webhookUrl === "string" && body.webhookUrl.trim().length > 0) {
    const raw = body.webhookUrl.trim();
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return new Response(JSON.stringify({ error: "Webhook URL must use http or https." }), { status: 400 });
      }
      webhookUrl = raw;
    } catch {
      return new Response(JSON.stringify({ error: "Webhook URL is not a valid URL." }), { status: 400 });
    }
  }

  const db = getDb();
  db.insert(schema.notificationPrefs)
    .values({ userId: session.user.id, emailOnOpen, webhookUrl })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { emailOnOpen, webhookUrl },
    })
    .run();

  return Response.json({ emailOnOpen, webhookUrl });
}
