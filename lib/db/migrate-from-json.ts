import { readFileSync, copyFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import type { Link } from "@/lib/store";

// Fill defaults for fields added after a record was first written, matching the logic in
// createFileStore's normalizeLink so any legacy db.json deserializes into a complete Link.
function normalizeLink(raw: Record<string, unknown>): Link {
  const r = raw as Partial<Link>;
  return {
    id: String(r.id),
    slug: String(r.slug),
    ownerUserId: r.ownerUserId ?? null,
    versions: r.versions ?? [],
    createdAt: String(r.createdAt),
    gate: r.gate ?? { requireEmail: false, allowedDomains: null, expiresAt: null, revoked: false },
    viewers: r.viewers ?? [],
    track: r.track ?? false,
    verifyEmail: r.verifyEmail ?? false,
    events: r.events ?? [],
    verifyAttempts: r.verifyAttempts ?? {},
  };
}

/**
 * Read a legacy `db.json` (`Record<string, Link>`) and insert each link into the SQLite DB.
 * Idempotent: a link whose `id` is already present in the `links` table is skipped.
 * After a successful run a copy of the source JSON is written to `<jsonPath>.imported-<ts>`.
 */
export function importJson(
  jsonPath: string,
  db: BetterSQLite3Database<typeof schema>,
): { imported: number; skipped: number } {
  const text = readFileSync(jsonPath, "utf8");
  const parsed = JSON.parse(text) as Record<string, Record<string, unknown>>;

  let imported = 0;
  let skipped = 0;

  for (const raw of Object.values(parsed)) {
    const link = normalizeLink(raw);

    // Idempotency check: skip if the link id is already in the links table.
    const existing = db
      .select({ id: schema.links.id })
      .from(schema.links)
      .where(eq(schema.links.id, link.id))
      .get();

    if (existing) {
      skipped++;
      continue;
    }

    // Insert the link row and all child rows in a single transaction.
    db.transaction((tx) => {
      tx.insert(schema.links)
        .values({
          id: link.id,
          slug: link.slug,
          ownerUserId: null, // legacy imports are ownerless; claimable by the first owner later
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
        .run();

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

    imported++;
  }

  // Back up the source JSON after a successful run so the migration is auditable.
  // We copy rather than rename so calling importJson again on the same path still works
  // (idempotent; the DB check prevents double-inserts regardless).
  copyFileSync(jsonPath, `${jsonPath}.imported-${Date.now()}`);

  return { imported, skipped };
}
