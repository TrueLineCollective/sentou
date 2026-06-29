import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  if (process.env.SENTOU_SECRET) return process.env.SENTOU_SECRET;
  // Fail closed in production: a missing secret means every self-hoster who forgot
  // to set it would run with a globally-known HMAC key from this public AGPL repo,
  // letting anyone forge access tokens. Only the named dev default survives, and
  // only outside production.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SENTOU_SECRET is required in production (refusing the insecure default signing key)");
  }
  return "dev-insecure-sentou-secret-change-me";
}
function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signAccessToken(payload: { linkId: string; email: string }): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyAccessToken(token: string | null | undefined): { linkId: string; email: string } | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof p?.linkId === "string" && typeof p?.email === "string") return { linkId: p.linkId, email: p.email };
    return null;
  } catch {
    return null;
  }
}
