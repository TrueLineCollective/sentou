import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import type { Link, LinkStore } from "@/lib/store";

// Map from a DB links row back to the nested Gate shape used throughout the engine.
function rowToLink(
  row: typeof schema.links.$inferSelect,
  versionRows: (typeof schema.versions.$inferSelect)[],
  viewerRows: (typeof schema.viewers.$inferSelect)[],
  eventRows: (typeof schema.events.$inferSelect)[],
): Link {
  return {
    id: row.id,
    slug: row.slug,
    ownerUserId: row.ownerUserId ?? null,
    versions: versionRows.map((v) => ({
      version: v.version,
      html: v.html,
      createdAt: v.createdAt,
    })),
    createdAt: row.createdAt,
    gate: {
      requireEmail: row.requireEmail,
      allowedDomains: row.allowedDomains ?? null,
      expiresAt: row.expiresAt ?? null,
      revoked: row.revoked,
    },
    viewers: viewerRows.map((v) => ({ email: v.email, at: v.at })),
    track: row.track,
    verifyEmail: row.verifyEmail,
    events: eventRows.map((e) => ({
      eventId: e.eventId,
      linkId: e.linkId,
      viewer: e.viewer,
      version: e.version,
      openedAt: e.openedAt,
      dwellMs: e.dwellMs,
    })),
    verifyAttempts: row.verifyAttempts ?? {},
  };
}

function assembleLink(
  db: BetterSQLite3Database<typeof schema>,
  row: typeof schema.links.$inferSelect,
): Link {
  // Fetch child rows ordered by their autoincrement id so insertion order is preserved.
  const versionRows = db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.linkId, row.id))
    .orderBy(schema.versions.id)
    .all();
  const viewerRows = db
    .select()
    .from(schema.viewers)
    .where(eq(schema.viewers.linkId, row.id))
    .orderBy(schema.viewers.id)
    .all();
  const eventRows = db
    .select()
    .from(schema.events)
    .where(eq(schema.events.linkId, row.id))
    .all();

  // Defensively apply the same caps the engine enforces on write (events ≤ 10000,
  // viewers ≤ 5000). Normally the engine never exceeds these, but a direct DB write
  // or a migrated legacy dataset could, so truncate on read.
  const cappedViewers = viewerRows.length > 5000 ? viewerRows.slice(-5000) : viewerRows;
  const cappedEvents = eventRows.length > 10000 ? eventRows.slice(-10000) : eventRows;

  return rowToLink(row, versionRows, cappedViewers, cappedEvents);
}

export function createSqliteStore(
  db: BetterSQLite3Database<typeof schema>,
): LinkStore {
  return {
    async put(link: Link): Promise<void> {
      // All mutations run inside one synchronous Drizzle transaction.
      // The callback receives tx (a transaction-scoped db handle); never await inside it.
      db.transaction((tx) => {
        // Upsert the links row (must come first — FK constraint on child tables).
        tx.insert(schema.links)
          .values({
            id: link.id,
            slug: link.slug,
            ownerUserId: link.ownerUserId ?? null,
            title: null,
            requireEmail: link.gate.requireEmail,
            allowedDomains: link.gate.allowedDomains,
            expiresAt: link.gate.expiresAt,
            revoked: link.gate.revoked,
            verifyEmail: link.verifyEmail,
            verifyAttempts: link.verifyAttempts,
            track: link.track,
            createdAt: link.createdAt,
          })
          .onConflictDoUpdate({
            target: schema.links.id,
            set: {
              slug: link.slug,
              requireEmail: link.gate.requireEmail,
              allowedDomains: link.gate.allowedDomains,
              expiresAt: link.gate.expiresAt,
              revoked: link.gate.revoked,
              verifyEmail: link.verifyEmail,
              verifyAttempts: link.verifyAttempts,
              track: link.track,
            },
          })
          .run();

        // Replace child rows: delete existing, then insert current.
        tx.delete(schema.versions).where(eq(schema.versions.linkId, link.id)).run();
        if (link.versions.length > 0) {
          tx.insert(schema.versions)
            .values(
              link.versions.map((v) => ({
                linkId: link.id,
                version: v.version,
                html: v.html,
                createdAt: v.createdAt,
              })),
            )
            .run();
        }

        tx.delete(schema.viewers).where(eq(schema.viewers.linkId, link.id)).run();
        if (link.viewers.length > 0) {
          tx.insert(schema.viewers)
            .values(
              link.viewers.map((v) => ({
                linkId: link.id,
                email: v.email,
                at: v.at,
              })),
            )
            .run();
        }

        tx.delete(schema.events).where(eq(schema.events.linkId, link.id)).run();
        if (link.events.length > 0) {
          tx.insert(schema.events)
            .values(
              link.events.map((e) => ({
                eventId: e.eventId,
                linkId: e.linkId,
                viewer: e.viewer,
                version: e.version,
                openedAt: e.openedAt,
                dwellMs: e.dwellMs,
              })),
            )
            .run();
        }
      });
    },

    async get(id: string): Promise<Link | null> {
      const row = db
        .select()
        .from(schema.links)
        .where(eq(schema.links.id, id))
        .get();
      if (!row) return null;
      return assembleLink(db, row);
    },

    async getBySlug(slug: string): Promise<Link | null> {
      const row = db
        .select()
        .from(schema.links)
        .where(eq(schema.links.slug, slug))
        .get();
      if (!row) return null;
      return assembleLink(db, row);
    },
  };
}
