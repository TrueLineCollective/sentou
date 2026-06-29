import { seal, open } from "@/lib/sealed-token";

type TrackClaim = { linkId: string; version: number; viewer: string; eventId: string };

export function signTrackToken(p: TrackClaim): string {
  return seal("track", p);
}
export function verifyTrackToken(token: string | null | undefined): TrackClaim | null {
  const p = open<TrackClaim>("track", token);
  if (p && typeof p.linkId === "string" && typeof p.viewer === "string" && typeof p.eventId === "string" && typeof p.version === "number") {
    return { linkId: p.linkId, version: p.version, viewer: p.viewer, eventId: p.eventId };
  }
  return null;
}
