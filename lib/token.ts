import { seal, open } from "@/lib/sealed-token";

// `verified` is true only when the email was proven via the one-time-code flow. It governs what
// gets stored and how tracking attributes opens: Sentou never persists an unverified address.
export type AccessClaim = { linkId: string; email: string; verified: boolean };

export function signAccessToken(payload: { linkId: string; email: string; verified?: boolean }): string {
  return seal("access", { linkId: payload.linkId, email: payload.email, verified: payload.verified === true });
}
export function verifyAccessToken(token: string | null | undefined): AccessClaim | null {
  const p = open<AccessClaim>("access", token);
  if (p && typeof p.linkId === "string" && typeof p.email === "string") {
    return { linkId: p.linkId, email: p.email, verified: p.verified === true };
  }
  return null;
}
