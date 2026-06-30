import { eq } from "drizzle-orm";
import { recordOpen, recordClose } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyTrackToken } from "@/lib/track-token";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { maybeNotifyOpen } from "@/lib/notifications";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export async function POST(req: Request) {
  // Unauthenticated beacon route: rate-limit per IP and cap the body before parsing. These
  // payloads are a few hundred bytes; reject anything that declares or delivers more.
  const rl = rateLimit(`track:${clientIp(req)}`, 120, 60_000);
  if (!rl.ok) return new Response(null, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  if (Number(req.headers.get("content-length") || 0) > 4096) return new Response(null, { status: 413 });

  let body: { token?: string; type?: string; dwellMs?: number };
  try {
    const text = await req.text();
    if (text.length > 4096) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!body.token) return new Response(null, { status: 400 });

  const claim = verifyTrackToken(body.token);
  if (!claim) return new Response(null, { status: 204 }); // ignore forged beacons silently

  if (body.type === "open") {
    const openedAt = new Date().toISOString();
    const firstOpen = await recordOpen(getStore(), {
      eventId: claim.eventId, linkId: claim.linkId, viewer: claim.viewer,
      version: claim.version, openedAt, dwellMs: 0,
    });

    // Fire notifications async and non-blocking. Failures are logged, never exposed.
    if (firstOpen) {
      const db = getDb();
      const linkRow = db
        .select({ ownerUserId: schema.links.ownerUserId, title: schema.links.title })
        .from(schema.links)
        .where(eq(schema.links.id, claim.linkId))
        .get();

      void maybeNotifyOpen({
        linkId: claim.linkId,
        linkTitle: linkRow?.title ?? null,
        ownerUserId: linkRow?.ownerUserId ?? null,
        viewer: claim.viewer,
        openedAt,
      }).catch(() => {
        // Safety net: maybeNotifyOpen already catches internally, but never propagate.
      });
    }
  } else if (body.type === "close") {
    await recordClose(getStore(), claim.linkId, claim.eventId, Math.max(0, Number(body.dwellMs) || 0));
  }
  return new Response(null, { status: 204 });
}
