// NOTE: better-auth 1.6.22 does not ship an `apiKey` plugin. The plan mentions
// it but it is not in this version's exports. apiKey support will be handled
// in a future upgrade or via a custom implementation in Task 5.
// Import paths confirmed against node_modules/better-auth/package.json exports:
//   better-auth              → dist/index.mjs (betterAuth)
//   better-auth/adapters/drizzle → @better-auth/drizzle-adapter (drizzleAdapter)
//   better-auth/plugins/organization → dist/plugins/organization/index.mjs
//   better-auth/next-js      → dist/integrations/next-js.mjs (toNextJsHandler)

import { randomUUID } from "node:crypto";
import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import { eq, and, gt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSender, emailConfigured } from "@/lib/email";
import { secureCookies } from "@/lib/owner";

// A better-sqlite3 UNIQUE/PRIMARYKEY collision, surfaced as a SqliteError with a code.
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT");
}

// Atomically claim the single workspace organization and its owner membership for the first
// account. Idempotent and race-safe: organization.slug is UNIQUE, so if two first signups
// race past the invite gate, only one transaction commits; the loser's INSERT throws a
// uniqueness violation, the whole transaction rolls back, and NO second owner is ever
// created. (A racing loser ends up as a registered account with no membership and therefore
// no owner/admin/member powers, rather than a second owner.)
export function bootstrapWorkspace(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
): void {
  const existing = db.select({ id: schema.organization.id }).from(schema.organization).limit(1).all();
  if (existing.length > 0) return; // workspace already claimed

  const now = new Date();
  const orgId = randomUUID();
  try {
    db.transaction((tx) => {
      tx.insert(schema.organization)
        .values({ id: orgId, name: "Workspace", slug: "workspace", createdAt: now })
        .run();
      tx.insert(schema.member)
        .values({ id: randomUUID(), organizationId: orgId, userId, role: "owner", createdAt: now })
        .run();
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // A concurrent signup already bootstrapped the workspace; leave it owned by the winner.
  }
}

// Factory so tests can create isolated auth instances against a temp DB.
export function makeAuth(db: BetterSQLite3Database<typeof schema> = getDb()) {
  const base =
    process.env.BETTER_AUTH_URL ??
    process.env.SENTOU_BASE_URL ??
    "http://localhost:3000";

  return betterAuth({
    baseURL: base,
    trustedOrigins: [base],
    secret: process.env.BETTER_AUTH_SECRET ?? process.env.SENTOU_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    advanced: { useSecureCookies: secureCookies() },
    databaseHooks: {
      user: {
        create: {
          // Gate sign-up: allow only the first owner OR a holder of a pending invite.
          async before(user) {
            const existing = await db
              .select({ id: schema.user.id })
              .from(schema.user)
              .limit(1);
            if (existing.length === 0) return; // first owner — allow unconditionally

            const pending = await db
              .select({ id: schema.invitation.id })
              .from(schema.invitation)
              .where(
                and(
                  eq(schema.invitation.email, user.email.toLowerCase()),
                  eq(schema.invitation.status, "pending"),
                  gt(schema.invitation.expiresAt, new Date()),
                ),
              )
              .limit(1);

            if (pending.length === 0) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Sign-up is invite-only. Ask an existing member for an invitation.",
              });
            }
          },

          // First-owner bootstrap: atomically claim the workspace org + owner membership.
          // Race-safe (see bootstrapWorkspace): two concurrent first signups cannot both
          // become owner.
          async after(user) {
            bootstrapWorkspace(db, user.id);
          },
        },
      },
    },
    plugins: [
      organization({
        // Prevent any member from creating a new org to self-promote to owner role.
        allowUserToCreateOrganization: false,
        async sendInvitationEmail(data) {
          // Fail closed in production when no email sender is configured: a silent
          // swallow here would let the invite record exist with no email delivered,
          // making it impossible for the recipient to accept without out-of-band help.
          if (!emailConfigured() && process.env.NODE_ENV === "production") {
            throw new Error(
              "[sentou] invitation email cannot be sent: SENTOU_RESEND_KEY and " +
                "SENTOU_EMAIL_FROM are required in production.",
            );
          }
          const acceptUrl = `${base}/accept-invite?token=${data.id}`;
          await getSender().sendInvite(data.email, acceptUrl);
        },
      }),
    ],
  });
}

// The application singleton — used by the Next.js route handler and all
// server-side code. Created at module load time from the default DB path.
export const auth = makeAuth();
