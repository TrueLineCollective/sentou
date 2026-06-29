import { timingSafeEqual } from "node:crypto";

// An operator who set a real public base URL has declared this instance internet-facing, even if
// NODE_ENV isn't "production" (a plain `next dev` exposed through a tunnel, say). Treat that as
// exposed so owner + stats endpoints can't sit open and leak viewer emails on a reachable host.
function exposedDeploy(): boolean {
  const base = process.env.SENTOU_BASE_URL;
  if (!base) return false;
  try {
    const h = new URL(base).hostname;
    return h !== "localhost" && h !== "127.0.0.1" && h !== "::1" && h !== "0.0.0.0";
  } catch {
    return false;
  }
}

export function requireOwner(req: Request): boolean {
  const expected = process.env.SENTOU_OWNER_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production" || exposedDeploy()) {
      throw new Error(
        "SENTOU_OWNER_TOKEN is required in production (refusing to leave owner and stats endpoints " +
          "open). Set it, or unset SENTOU_BASE_URL for purely local use.",
      );
    }
    return true; // single-tenant / local dev default: no auth
  }
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
