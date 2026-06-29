// NOTE: better-auth 1.6.22 does not ship an `apiKey` plugin. The plan mentions
// it but it is not in this version's exports. apiKey support will be handled
// in a future upgrade or via a custom implementation in Task 5.
// Import paths confirmed against node_modules/better-auth/package.json exports:
//   better-auth              → dist/index.mjs (betterAuth)
//   better-auth/adapters/drizzle → @better-auth/drizzle-adapter (drizzleAdapter)
//   better-auth/plugins/organization → dist/plugins/organization/index.mjs
//   better-auth/next-js      → dist/integrations/next-js.mjs (toNextJsHandler)

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSender } from "@/lib/email";
import { secureCookies } from "@/lib/owner";

// Factory so tests can create isolated auth instances against a temp DB.
export function makeAuth(db: BetterSQLite3Database<typeof schema> = getDb()) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    advanced: { useSecureCookies: secureCookies() },
    plugins: [
      organization({
        async sendInvitationEmail(data) {
          const base = process.env.SENTOU_BASE_URL ?? "http://localhost:3000";
          const url = `${base}/accept-invite?token=${data.id}`;
          await getSender().sendCode(data.email, url);
        },
      }),
    ],
  });
}

// The application singleton — used by the Next.js route handler and all
// server-side code. Created at module load time from the default DB path.
export const auth = makeAuth();
