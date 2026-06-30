import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { createSqliteStore } from "@/lib/store-sqlite";
import type { LinkStore } from "@/lib/store";

let store: LinkStore | null = null;
let storePath: string | null = null;

export function getStore(): LinkStore {
  // Re-read SENTOU_DB so a changed path rebinds the store. In production the env
  // is fixed, so the store is created once; in tests, a fresh per-test SENTOU_DB
  // (set in beforeEach) isolates each test against its own SQLite file.
  const path = process.env.SENTOU_DB ?? ".sentou/sentou.db";
  if (!store || storePath !== path) {
    const db = getDb(path);
    // Apply any pending migrations; idempotent, safe to call on every rebind.
    migrate(db, { migrationsFolder: "lib/db/migrations" });
    store = createSqliteStore(db);
    storePath = path;
  }
  return store;
}

export function linkUrl(slug: string): string {
  return `${process.env.SENTOU_BASE_URL ?? "http://localhost:3000"}/v/${slug}`;
}
