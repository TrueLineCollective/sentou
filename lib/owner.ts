import { timingSafeEqual } from "node:crypto";

export function requireOwner(req: Request): boolean {
  const expected = process.env.SENTOU_OWNER_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SENTOU_OWNER_TOKEN is required in production (refusing to leave owner endpoints open)");
    }
    return true; // single-tenant / dev default: no auth
  }
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
