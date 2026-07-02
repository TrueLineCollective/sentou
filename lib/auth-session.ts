// Identity resolution for owner API endpoints.
//
// getActor resolves the acting identity from EITHER a Better Auth session cookie
// (parsed via auth.api.getSession) OR an Authorization: Bearer <apiKey> header
// (verified by hashing the raw key and looking it up in the api_key table).
//
// NOTE: better-auth 1.6.x does not ship a built-in apiKey plugin; the separate
// @better-auth/api-key package (1.6.23) is a stub with no implementation. The
// api_key table and verification logic here are a custom implementation that
// achieves the same result.

import { randomBytes, createHash, randomUUID } from "node:crypto";
import { eq, and, asc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
// makeAuth is imported as a type only to avoid the circular dependency:
//   lib/auth.ts → lib/owner.ts → lib/auth-session.ts → (runtime) lib/auth.ts
// The runtime import of `auth` is done lazily inside getActor() below.
import type { makeAuth } from "@/lib/auth";

export type Actor = { userId: string; role: string };

type AuthInstance = ReturnType<typeof makeAuth>;

// Returns true when the actor holds an elevated role (owner or admin).
export function isAdmin(actor: Actor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

// Resolves the user's membership role in the workspace org (oldest by createdAt,
// then id as tiebreaker), or null when the user has no membership row there.
// Scoping to the workspace org prevents a user from gaining elevated rights by
// joining or creating a second org. null is the load-bearing signal for
// authorization: a removed member, an orphaned invite (signed up but never
// accepted), and a race-losing "second owner" all have no row here and so must
// not resolve to an authorized actor.
export function resolveMembership(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
): string | null {
  const workspaceOrg = db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(asc(schema.organization.createdAt), asc(schema.organization.id))
    .limit(1)
    .get();

  if (!workspaceOrg) return null;

  const memberRow = db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.userId, userId),
        eq(schema.member.organizationId, workspaceOrg.id),
      ),
    )
    .get();

  return memberRow?.role ?? null;
}

// Back-compat helper for the dashboard pages that only need a role string to
// compute isAdmin: a non-member reads as "member" (never elevated), which is
// harmless there. Authorization decisions must use resolveMembership /
// resolveActor, which fail closed on a missing membership.
export function resolveRole(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
): string {
  return resolveMembership(db, userId) ?? "member";
}

// Internal implementation — shared between the factory (tests) and the
// module-level function (production).
async function resolveActor(
  authInst: AuthInstance,
  db: BetterSQLite3Database<typeof schema>,
  req: Request,
): Promise<Actor | null> {
  // ── 1. Session cookie ──────────────────────────────────────────────────────
  // Pass the request headers to better-auth's session handler. It reads the
  // signed session cookie and returns the user + session or null.
  const session = await authInst.api.getSession({ headers: req.headers });
  if (session?.user?.id) {
    // Require a live workspace membership. A valid session for a removed member
    // (or an account that signed up but never accepted its invite) must NOT be
    // an authorized actor, so removing someone actually revokes their access.
    const role = resolveMembership(db, session.user.id);
    if (!role) return null;
    return { userId: session.user.id, role };
  }

  // ── 2. Bearer API key ──────────────────────────────────────────────────────
  // Expect: Authorization: Bearer <rawKey>
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) return null;

  // Never store the raw key — compare against the stored SHA-256 digest.
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyRow = db
    .select()
    .from(schema.apiKey)
    .where(and(eq(schema.apiKey.keyHash, keyHash), eq(schema.apiKey.enabled, true)))
    .get();

  if (!keyRow) return null;
  if (keyRow.expiresAt !== null && keyRow.expiresAt < new Date()) return null;

  // Best-effort last-used timestamp; synchronous since better-sqlite3 is sync.
  db.update(schema.apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKey.id, keyRow.id))
    .run();

  // Same membership requirement as the session path: a key belonging to a
  // removed member resolves to no actor, so revoking membership revokes the key.
  const role = resolveMembership(db, keyRow.userId);
  if (!role) return null;
  return { userId: keyRow.userId, role };
}

// Factory for tests: inject a test-specific auth instance and DB handle.
export function makeGetActor(
  authInst: AuthInstance,
  db: BetterSQLite3Database<typeof schema>,
): (req: Request) => Promise<Actor | null> {
  return (req: Request) => resolveActor(authInst, db, req);
}

// Module-level function for production use.
// `auth` is imported lazily (dynamic import) to break the circular dependency:
//   lib/auth.ts → lib/owner.ts → lib/auth-session.ts → (lazy) lib/auth.ts
export async function getActor(req: Request): Promise<Actor | null> {
  const { auth } = await import("@/lib/auth");
  return resolveActor(auth, getDb(), req);
}

// ── API key generation ──────────────────────────────────────────────────────

// Generates a new plaintext API key with ≥256 bits of entropy.
export function generateApiKey(): string {
  return "sentou_" + randomBytes(32).toString("base64url");
}

// Creates an API key for the given user, stores only the SHA-256 hash, and
// returns the plaintext key exactly once. The display prefix is a separate
// random value — not derived from the "sentou_" brand constant.
export function createApiKey(
  userId: string,
  name: string,
): { key: string; prefix: string; name: string } {
  const db = getDb();
  const key = generateApiKey();
  const keyHash = createHash("sha256").update(key).digest("hex");
  // Use independent random bytes for the display prefix.
  const prefix = randomBytes(4).toString("hex");

  db.insert(schema.apiKey).values({
    id: randomUUID(),
    userId,
    name,
    keyHash,
    prefix,
    createdAt: new Date(),
    enabled: true,
  }).run();

  return { key, prefix, name };
}
