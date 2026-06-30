// Runs once when the server starts (Next.js instrumentation hook). We use it to surface
// production-only footguns at boot instead of leaving the operator to discover them from
// broken links or closed endpoints later.
export async function register() {
  // register() is called in every runtime (nodejs + edge); only run from the Node server process.
  // NEXT_RUNTIME is "nodejs" in the Node runtime and "edge" in the Edge runtime.
  // When NEXT_RUNTIME is undefined we are in a standard Node process (e.g. `next dev`), so treat
  // undefined the same as "nodejs".
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

  // Apply all pending DB migrations at boot so every table (domain + auth) exists before the
  // first request arrives. Without this, hitting /api/auth/* on a fresh DB would fail because
  // the Better Auth tables would not yet exist (getStore() applies migrations lazily, but the
  // auth handler bypasses getStore()).
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { getDb } = await import("@/lib/db/client");
  migrate(getDb(), { migrationsFolder: "lib/db/migrations" });

  if (process.env.NODE_ENV !== "production") return;

  const warn = (m: string) => console.warn(`[sentou] ${m}`);
  if (!process.env.SENTOU_BASE_URL) {
    warn("SENTOU_BASE_URL is not set; generated links will point at http://localhost:3000.");
  }
  if (!process.env.SENTOU_SECRET) {
    warn(
      "SENTOU_SECRET is not set; a random per-process key will be used " +
        "(session and access cookies will not survive restarts).",
    );
  }
  // Warn when no owner account exists yet. On a production or internet-exposed instance
  // with no account, the owner API endpoints will refuse all requests until one is created.
  // Wrapped in try/catch so an uninitialized or missing DB does not crash boot.
  try {
    const db = getDb();
    const { user } = await import("@/lib/db/schema");
    const { exposedDeploy } = await import("@/lib/owner");
    const firstUser = db.select({ id: user.id }).from(user).limit(1).get();
    if (!firstUser) {
      if (exposedDeploy()) {
        // Security: until the owner is claimed, the first visitor to /setup becomes owner.
        warn(
          "SECURITY: this instance is internet-exposed with NO owner account yet. The first " +
            "visitor to /setup will claim ownership. Complete /setup now, before sharing the URL.",
        );
      } else {
        warn(
          "No owner account yet; sign up the first owner, then create an API key " +
            "for automation or MCP use via POST /api/keys.",
        );
      }
    }
  } catch {
    // DB or table not ready at boot; skip the account check.
  }
}
