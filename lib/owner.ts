import { timingSafeEqual, createHash } from "node:crypto";

// An operator who set a real public base URL has declared this instance internet-facing, even if
// NODE_ENV isn't "production" (a plain `next dev` exposed through a tunnel, say). Treat that as
// exposed so owner + stats endpoints can't sit open and leak viewer emails on a reachable host.
export function exposedDeploy(): boolean {
  const base = process.env.SENTOU_BASE_URL;
  if (!base) return false;
  try {
    const h = new URL(base).hostname;
    return h !== "localhost" && h !== "127.0.0.1" && h !== "::1" && h !== "0.0.0.0";
  } catch {
    return false;
  }
}

// Set the cookie Secure flag whenever the instance is reachable over a network, not just when
// NODE_ENV is production: an exposed `next dev` (non-localhost base URL) still needs Secure cookies
// so an on-path attacker can't lift an access cookie over a stray HTTP path.
export function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" || exposedDeploy();
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
  // Hash both to a fixed 32 bytes before the constant-time compare, so timing (and the
  // length precondition timingSafeEqual needs) can't leak the expected token's length.
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
