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

  // Preflight: in a standalone/Docker build the migrations folder is copied by the Dockerfile
  // (it is read by path at runtime, not bundled by the tracer). If it is missing, fail with an
  // actionable message instead of drizzle's cryptic "Can't find meta/_journal.json".
  const { existsSync } = await import("node:fs");
  const migrationsFolder = "lib/db/migrations";
  if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
    throw new Error(
      `[sentou] DB migrations not found at "${migrationsFolder}" (cwd=${process.cwd()}). ` +
        "For a standalone/Docker build, ensure lib/db/migrations is copied into the runtime image (see Dockerfile).",
    );
  }
  migrate(getDb(), { migrationsFolder });

  const warn = (m: string) => console.warn(`[sentou] ${m}`);

  // Unclaimed-owner warning fires on any exposed OR production instance — the same posture that
  // makes the owner API fail closed — so an exposed dev/tunnel operator is warned too, not only
  // a NODE_ENV=production one. Wrapped in try/catch so an uninitialized DB does not crash boot.
  const { exposedDeploy } = await import("@/lib/owner");
  const exposed = exposedDeploy();
  if (exposed || process.env.NODE_ENV === "production") {
    try {
      const db = getDb();
      const { user } = await import("@/lib/db/schema");
      const firstUser = db.select({ id: user.id }).from(user).limit(1).get();
      if (!firstUser) {
        warn(
          exposed
            ? "SECURITY: this instance is reachable from outside localhost with NO owner account yet. " +
                "The first visitor to /setup will claim ownership. Complete /setup now, before sharing the URL."
            : "No owner account yet; sign up the first owner, then create an API key " +
                "for automation or MCP use via POST /api/keys.",
        );
      }
    } catch {
      // DB or table not ready at boot; skip the account check.
    }
  }

  if (process.env.NODE_ENV !== "production") return;

  // Production-only configuration warnings.
  if (!process.env.SENTOU_BASE_URL) {
    warn("SENTOU_BASE_URL is not set; generated links will point at http://localhost:3000.");
  }
  if (!process.env.SENTOU_SECRET) {
    warn(
      "SENTOU_SECRET is not set; a random per-process key will be used " +
        "(session and access cookies will not survive restarts).",
    );
  }
}
