import { createHmac, createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function secret(): string {
  if (process.env.SENTOU_SECRET) return process.env.SENTOU_SECRET;
  // Fail closed in production: the encrypted track token's confidentiality, and the
  // owner-held linkId inside it, rests entirely on this key. A self-hoster who forgot to
  // set it would run on the globally-known default key from this public repo, which both
  // defeats the encryption and lets anyone forge tracking events.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SENTOU_SECRET is required in production (refusing the insecure default signing key)");
  }
  return "dev-insecure-sentou-secret-change-me";
}
function sign(body: string): string {
  return createHmac("sha256", secret()).update("track." + body).digest("base64url");
}

// The token body is ENCRYPTED, not just signed: it travels to every recipient in the
// viewer page, so a plaintext (signed-but-readable) payload would leak the owner-held
// linkId, which is the capability that protects /api/stats. Symmetric encryption keeps
// {linkId,version,viewer,eventId} recoverable server-side while opaque to the client.
function encKey(): Buffer {
  return createHash("sha256").update("track-enc." + secret()).digest();
}
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}
function decrypt(body: string): string | null {
  try {
    const raw = Buffer.from(body, "base64url");
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch { return null; }
}

export function signTrackToken(p: { linkId: string; version: number; viewer: string; eventId: string }): string {
  const body = encrypt(JSON.stringify(p));
  return `${body}.${sign(body)}`;
}

export function verifyTrackToken(token: string | null | undefined) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const plain = decrypt(body);
  if (plain === null) return null;
  try {
    const p = JSON.parse(plain);
    if (typeof p?.linkId === "string" && typeof p?.viewer === "string" && typeof p?.eventId === "string" && typeof p?.version === "number") {
      return { linkId: p.linkId, version: p.version, viewer: p.viewer, eventId: p.eventId };
    }
    return null;
  } catch { return null; }
}
