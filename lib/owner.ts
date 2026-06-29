import { timingSafeEqual } from "node:crypto";

export function requireOwner(req: Request): boolean {
  const expected = process.env.SENTOU_OWNER_TOKEN;
  if (!expected) return true; // single-tenant / dev default: no auth
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
