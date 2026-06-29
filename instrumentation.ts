// Runs once when the server starts (Next.js instrumentation hook). We use it to surface the
// production-only footguns at boot instead of leaving the operator to discover them from broken
// links or open endpoints later. SENTOU_SECRET's absence already throws on first crypto use, so
// it isn't repeated here.
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
  if (!process.env.SENTOU_OWNER_TOKEN) {
    warn("SENTOU_OWNER_TOKEN is not set; owner and stats endpoints will refuse requests in production.");
  }
}
