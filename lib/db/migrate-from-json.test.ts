import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { importJson } from "@/lib/db/migrate-from-json";
import { createSqliteStore } from "@/lib/store-sqlite";
import type { Link } from "@/lib/store";

function makeTempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "sentou-migrate-"));
  const dbFile = path.join(dir, "t.db");
  const jsonFile = path.join(dir, "db.json");
  const db = getDb(dbFile);
  migrate(db, { migrationsFolder: "lib/db/migrations" });
  return { db, jsonFile };
}

const originalLink: Link = {
  id: "import-test-id",
  slug: "import-test-slug",
  ownerUserId: "will-be-overridden-by-null",
  versions: [{ version: 1, html: "<h1>migrated</h1>", createdAt: "2026-01-01T00:00:00.000Z" }],
  createdAt: "2026-01-01T00:00:00.000Z",
  gate: {
    requireEmail: true,
    allowedDomains: ["acme.com"],
    expiresAt: "2030-01-01T00:00:00.000Z",
    revoked: false,
  },
  viewers: [{ email: "a@acme.com", at: "2026-01-02T00:00:00.000Z" }],
  track: true,
  verifyEmail: false,
  events: [
    {
      eventId: "e1",
      linkId: "import-test-id",
      viewer: "a@acme.com",
      version: 1,
      openedAt: "2026-01-02T00:00:00.000Z",
      dwellMs: 4500,
    },
  ],
  verifyAttempts: {},
};

const jsonContent = JSON.stringify({ "import-test-id": originalLink }, null, 2);

describe("importJson", () => {
  it("imports a link on the first run, skips it on a second run, and round-trips via the SQLite store", async () => {
    const { db, jsonFile } = makeTempDb();

    // First run: should import 1
    writeFileSync(jsonFile, jsonContent);
    const result1 = importJson(jsonFile, db);
    expect(result1).toEqual({ imported: 1, skipped: 0 });

    // Second run on the same db: the link id is already present, so it should be skipped.
    // The backup from the first run left the original file in place (copyFileSync), so
    // calling importJson again with the same path is valid.
    const result2 = importJson(jsonFile, db);
    expect(result2).toEqual({ imported: 0, skipped: 1 });

    // Round-trip: the SQLite store should return a Link equivalent to the original.
    const store = createSqliteStore(db);
    const fetched = await store.getBySlug("import-test-slug");
    expect(fetched).not.toBeNull();

    // Gate fields must round-trip exactly.
    expect(fetched!.gate).toEqual(originalLink.gate);

    // Viewers must round-trip.
    expect(fetched!.viewers).toEqual(originalLink.viewers);

    // Events must round-trip (gate + dwell).
    expect(fetched!.events).toHaveLength(1);
    expect(fetched!.events[0].eventId).toBe("e1");
    expect(fetched!.events[0].dwellMs).toBe(4500);
    expect(fetched!.events[0].viewer).toBe("a@acme.com");

    // ownerUserId must be null regardless of what was in the JSON.
    expect(fetched!.ownerUserId).toBeNull();
  });
});
