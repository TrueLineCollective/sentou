import { seal, open } from "@/lib/sealed-token";

export type AccessClaim = { linkId: string; email: string };

export function signAccessToken(payload: AccessClaim): string {
  return seal("access", payload);
}
export function verifyAccessToken(token: string | null | undefined): AccessClaim | null {
  const p = open<AccessClaim>("access", token);
  if (p && typeof p.linkId === "string" && typeof p.email === "string") return { linkId: p.linkId, email: p.email };
  return null;
}
