import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { createSqliteStore } from "@/lib/store-sqlite";
import { createLink, republish, recordViewer, recordOpen, recordClose } from "@/lib/links";

function makeStore(file: string) {
  const db = getDb(file);
  migrate(db, { migrationsFolder: "lib/db/migrations" });
  return createSqliteStore(db);
}

describe("sqlite store", () => {
  it("persists links across separate store instances pointing at the same file", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-sqlite-")), "t.db");
    const a = makeStore(file);
    const link = await createLink(a, "<h1>v1</h1>");
    await republish(a, link.id, "<h1>v2</h1>");

    // Second store backed by the same DB file (same cached connection — persistence is proven
    // by the data being in the DB, not by a new connection opening).
    const b = makeStore(file);
    const reloaded = await b.getBySlug(link.slug);
    expect(reloaded).not.toBeNull();
    const { currentHtml } = await import("@/lib/links");
    expect(currentHtml(reloaded!)).toBe("<h1>v2</h1>");
  });

  it("round-trips the gate and recorded viewers through a fresh store instance", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-sqlite-")), "t.db");
    const a = makeStore(file);
    const link = await createLink(a, "<h1>x</h1>", {
      requireEmail: true,
      allowedDomains: ["acme.com"],
      expiresAt: "2030-01-01T00:00:00.000Z",
      revoked: false,
    });
    await recordViewer(a, link.id, "a@acme.com");

    const b = makeStore(file);
    const reloaded = await b.getBySlug(link.slug);
    expect(reloaded!.gate).toEqual({
      requireEmail: true,
      allowedDomains: ["acme.com"],
      expiresAt: "2030-01-01T00:00:00.000Z",
      revoked: false,
    });
    expect(reloaded!.viewers.map((v) => v.email)).toEqual(["a@acme.com"]);
  });

  it("round-trips tracking events (open + close) and preserves dwell", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-sqlite-")), "t.db");
    const store = makeStore(file);
    const link = await createLink(store, "<h1>track</h1>", undefined, true);
    await recordOpen(store, {
      eventId: "e1",
      linkId: link.id,
      viewer: "b@x.com",
      version: 1,
      openedAt: "2026-06-29T00:00:00.000Z",
      dwellMs: 0,
    });
    await recordClose(store, link.id, "e1", 5000);

    const reloaded = await makeStore(file).get(link.id);
    expect(reloaded!.events).toHaveLength(1);
    expect(reloaded!.events[0].dwellMs).toBe(5000);
    expect(reloaded!.events[0].viewer).toBe("b@x.com");
  });
});
