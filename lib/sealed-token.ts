import { createHmac, createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function getSecret(): string {
  if (process.env.SENTOU_SECRET) return process.env.SENTOU_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SENTOU_SECRET is required in production (refusing the insecure default signing key)");
  }
  return "dev-insecure-sentou-secret-change-me";
}
function encKey(): Buffer {
  return createHash("sha256").update("seal-enc." + getSecret()).digest();
}
function mac(domain: string, body: string): string {
  return createHmac("sha256", getSecret()).update(domain + "." + body).digest("base64url");
}
export function seal(domain: string, payload: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const body = Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
  return `${body}.${mac(domain, body)}`;
}
export function open<T>(domain: string, token: string | null | undefined): T | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(domain, body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = Buffer.from(body, "base64url");
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), data = raw.subarray(28);
    const d = createDecipheriv("aes-256-gcm", encKey(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8")) as T;
  } catch { return null; }
}
