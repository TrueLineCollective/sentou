import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  return process.env.SENTOU_SECRET || "dev-insecure-sentou-secret-change-me";
}
function sign(body: string): string {
  return createHmac("sha256", secret()).update("track." + body).digest("base64url");
}

export function signTrackToken(p: { linkId: string; version: number; viewer: string; eventId: string }): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyTrackToken(token: string | null | undefined) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof p?.linkId === "string" && typeof p?.viewer === "string" && typeof p?.eventId === "string" && typeof p?.version === "number") {
      return { linkId: p.linkId, version: p.version, viewer: p.viewer, eventId: p.eventId };
    }
    return null;
  } catch { return null; }
}
