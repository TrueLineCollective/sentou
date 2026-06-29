import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  return process.env.SENTOU_SECRET || "dev-insecure-sentou-secret-change-me";
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
