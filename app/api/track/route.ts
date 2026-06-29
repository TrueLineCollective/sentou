import { recordOpen, recordClose } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyTrackToken } from "@/lib/track-token";

export async function POST(req: Request) {
  let body: { token?: string; type?: string; dwellMs?: number };
  try {
    const text = await req.text();
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!body.token) return new Response(null, { status: 400 });

  const claim = verifyTrackToken(body.token);
  if (!claim) return new Response(null, { status: 204 }); // ignore forged beacons silently

  if (body.type === "open") {
    await recordOpen(getStore(), {
      eventId: claim.eventId, linkId: claim.linkId, viewer: claim.viewer,
      version: claim.version, openedAt: new Date().toISOString(), dwellMs: 0,
    });
  } else if (body.type === "close") {
    await recordClose(getStore(), claim.linkId, claim.eventId, Math.max(0, Number(body.dwellMs) || 0));
  }
  return new Response(null, { status: 204 });
}
