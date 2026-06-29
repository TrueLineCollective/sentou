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

import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
// makeAuth is imported as a type only to avoid the circular dependency:
//   lib/auth.ts → lib/owner.ts → lib/auth-session.ts → (runtime) lib/auth.ts
// The runtime import of `auth` is done lazily inside getActor() below.
import type { makeAuth } from "@/lib/auth";

export type Actor = { userId: string; role: string };

type AuthInstance = ReturnType<typeof makeAuth>;

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
    const memberRow = db
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.userId, session.user.id))
      .get();
    return { userId: session.user.id, role: memberRow?.role ?? "member" };
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

  const memberRow = db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(eq(schema.member.userId, keyRow.userId))
    .get();
  return { userId: keyRow.userId, role: memberRow?.role ?? "member" };
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
