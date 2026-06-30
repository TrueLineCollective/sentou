import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

let cachedPath: string | null = null;
let cachedRaw: Database.Database | null = null;
let cachedDb: BetterSQLite3Database<typeof schema> | null = null;

function resolvePath(path?: string): string {
  return path ?? process.env.SENTOU_DB ?? ".sentou/sentou.db";
}

export function getSqlite(path?: string): Database.Database {
  const p = resolvePath(path);
  if (cachedRaw && cachedPath === p) return cachedRaw;
  mkdirSync(dirname(p), { recursive: true });
  const raw = new Database(p);
  raw.pragma("journal_mode = WAL"); // concurrent readers + one writer; fits the single-process model
  raw.pragma("foreign_keys = ON");
  cachedRaw = raw;
  cachedPath = p;
  cachedDb = null;
  return raw;
}

export function getDb(path?: string): BetterSQLite3Database<typeof schema> {
  const p = resolvePath(path);
  if (cachedDb && cachedPath === p) return cachedDb;
  cachedDb = drizzle(getSqlite(p), { schema });
  return cachedDb;
}
