import type { Actor } from "@/lib/auth-session";

// An operator who set a real public base URL has declared this instance
// internet-facing, even if NODE_ENV isn't "production" (a plain `next dev`
// exposed through a tunnel, say). Treat that as exposed so owner + stats
// endpoints can't sit open and leak viewer emails on a reachable host.
// Both SENTOU_BASE_URL and BETTER_AUTH_URL are checked so a deploy that only
// sets BETTER_AUTH_URL (common for auth-first setups) also gets the
// fail-closed treatment.
export function exposedDeploy(): boolean {
  const base = process.env.SENTOU_BASE_URL ?? process.env.BETTER_AUTH_URL;
  if (!base) return false;
  try {
    const h = new URL(base).hostname;
    return h !== "localhost" && h !== "127.0.0.1" && h !== "::1" && h !== "0.0.0.0";
  } catch {
    return false;
  }
}

// Set the cookie Secure flag whenever the instance is reachable over a network,
// not just when NODE_ENV is production: an exposed `next dev` (non-localhost
// base URL) still needs Secure cookies so an on-path attacker can't lift a
// session cookie over a stray HTTP path. Both URL env vars are checked.
export function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" || exposedDeploy();
}

// Identity-aware gate for owner API endpoints.
//
// Resolves the actor via lib/auth-session.ts (session cookie or API key).
// - actor present        → authorized; returns the actor
// - production/exposed, no actor → throws (fail closed; caller returns 401)
// - dev/local, no actor  → returns null (open for local use)
//
// requireOwner becomes async because getActor must await the Better Auth
// session lookup.
export async function requireOwner(req: Request): Promise<Actor | null> {
  // Lazy import breaks the circular dependency:
  //   lib/auth.ts → lib/owner.ts → lib/auth-session.ts → (dynamic) lib/auth.ts
  const { getActor } = await import("@/lib/auth-session");
  const actor = await getActor(req);
  if (actor) return actor;
  if (process.env.NODE_ENV === "production" || exposedDeploy()) {
    throw new Error(
      "Owner authentication is required in production / exposed deploy. " +
        "Use a session cookie or an API key (Authorization: Bearer <key>). " +
        "Unset SENTOU_BASE_URL and BETTER_AUTH_URL for purely local use.",
    );
  }
  // Single-tenant / local dev default: no auth required.
  return null;
}
