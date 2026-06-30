import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "@/lib/db/client";
import { links } from "@/lib/db/schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

describe("schema", () => {
  it("creates the links table and round-trips a row", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "t.db");
    migrate(getDb(file), { migrationsFolder: "lib/db/migrations" });
    const db = getDb(file);
    db.insert(links).values({
      id: "l1",
      slug: "s1",
      ownerUserId: null,
      title: "Deck",
      requireEmail: false,
      allowedDomains: null,
      expiresAt: null,
      revoked: false,
      verifyEmail: false,
      track: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    }).run();
    const rows = db.select().from(links).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("s1");
  });
});
