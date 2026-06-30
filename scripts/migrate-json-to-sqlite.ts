/**
 * One-time CLI to migrate a legacy db.json store into the SQLite DB.
 *
 * Usage:
 *   SENTOU_DB_JSON=.sentou/db.json SENTOU_DB=.sentou/sentou.db npm run migrate:json
 *
 * Environment variables:
 *   SENTOU_DB_JSON  Path to the legacy JSON store (required).
 *   SENTOU_DB       Path to the SQLite DB (defaults to .sentou/sentou.db via getDb).
 */
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { importJson } from "@/lib/db/migrate-from-json";

const jsonPath = process.env.SENTOU_DB_JSON;
if (!jsonPath) {
  console.error("Error: SENTOU_DB_JSON environment variable is required.");
  process.exit(1);
}

// SENTOU_DB is consumed by getDb via the env; no need to pass it explicitly.
const db = getDb();

console.log("Applying migrations...");
migrate(db, { migrationsFolder: "lib/db/migrations" });

console.log(`Importing from ${jsonPath}...`);
const { imported, skipped } = importJson(jsonPath, db);
console.log(`Done. imported: ${imported}, skipped: ${skipped}`);
