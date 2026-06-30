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

// Resolves the actor's role, scoped to the workspace org (oldest by createdAt,
// then id as tiebreaker). Defaults to "member" if the user has no membership.
// Using the workspace org prevents a user from gaining elevated rights by
// joining or creating a second org.
export function resolveRole(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
): string {
  const workspaceOrg = db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(asc(schema.organization.createdAt), asc(schema.organization.id))
    .limit(1)
    .get();

  if (!workspaceOrg) return "member";

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

  return memberRow?.role ?? "member";
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
    const role = resolveRole(db, session.user.id);
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

  const role = resolveRole(db, keyRow.userId);
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
