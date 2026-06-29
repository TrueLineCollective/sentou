import { seal, open } from "@/lib/sealed-token";

// `verified` is true only when the email was proven via the one-time-code flow. It governs what
// gets stored and how tracking attributes opens: Sentou never persists an unverified address.
export type AccessClaim = { linkId: string; email: string; verified: boolean };

// Access sessions expire so a link opened on a shared or work machine does not grant access
// forever. The link's own expiresAt is a separate, hard cutoff; this bounds the session itself.
export const ACCESS_TTL_MS = 7 * 24 * 3600_000;

export function signAccessToken(payload: { linkId: string; email: string; verified?: boolean }): string {
  return seal("access", {
    linkId: payload.linkId,
    email: payload.email,
    verified: payload.verified === true,
    exp: Date.now() + ACCESS_TTL_MS,
  });
}
export function verifyAccessToken(token: string | null | undefined, now: number = Date.now()): AccessClaim | null {
  const p = open<AccessClaim & { exp?: number }>("access", token);
  if (p && typeof p.linkId === "string" && typeof p.email === "string" && typeof p.exp === "number" && now < p.exp) {
    return { linkId: p.linkId, email: p.email, verified: p.verified === true };
  }
  return null;
}
