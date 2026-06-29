import { seal, open } from "@/lib/sealed-token";

type TrackClaim = { linkId: string; version: number; viewer: string; eventId: string; exp: number };

export function signTrackToken(p: TrackClaim): string {
  return seal("track", p);
}
export function verifyTrackToken(token: string | null | undefined, now: number = Date.now()): TrackClaim | null {
  const p = open<TrackClaim>("track", token);
  // exp bounds replay: a recipient can't keep re-firing open/close beacons to inflate dwell long
  // after the link was rendered. The eventId is sealed in too, so opens upsert rather than stack.
  if (
    p && typeof p.linkId === "string" && typeof p.viewer === "string" && typeof p.eventId === "string" &&
    typeof p.version === "number" && typeof p.exp === "number" && now < p.exp
  ) {
    return { linkId: p.linkId, version: p.version, viewer: p.viewer, eventId: p.eventId, exp: p.exp };
  }
  return null;
}
