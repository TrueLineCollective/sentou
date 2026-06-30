import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb, getSqlite } from "@/lib/db/client";

describe("db client", () => {
  it("opens a sqlite file in WAL mode and returns a drizzle instance", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-db-")), "t.db");
    const raw = getSqlite(file);
    expect(raw.pragma("journal_mode", { simple: true })).toBe("wal");
    const db = getDb(file);
    expect(db).toBeTruthy();
  });
});
