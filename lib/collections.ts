import { nanoid } from "nanoid";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";
import { isAdmin, type Actor } from "@/lib/auth-session";

type DB = BetterSQLite3Database<typeof schema>;

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function createCollection(db: DB, ownerUserId: string, title: string) {
  const id = nanoid();
  const slug = nanoid(10);
  const createdAt = new Date().toISOString();
  db.insert(schema.collections).values({ id, slug, ownerUserId, title, createdAt }).run();
  return { id, slug, ownerUserId, title, createdAt };
}

// Returns collections visible to the actor, each with a denormalized link count.
export function getCollectionsForUser(db: DB, userId: string, admin: boolean) {
  return db
    .select({
      id: schema.collections.id,
      slug: schema.collections.slug,
      ownerUserId: schema.collections.ownerUserId,
      title: schema.collections.title,
      createdAt: schema.collections.createdAt,
      linkCount: sql<number>`COUNT(${schema.collectionLinks.id})`,
    })
    .from(schema.collections)
    .leftJoin(
      schema.collectionLinks,
      eq(schema.collectionLinks.collectionId, schema.collections.id),
    )
    .where(admin ? undefined : eq(schema.collections.ownerUserId, userId))
    .groupBy(schema.collections.id)
    .orderBy(asc(schema.collections.createdAt))
    .all();
}

export function getCollectionById(db: DB, id: string) {
  return (
    db.select().from(schema.collections).where(eq(schema.collections.id, id)).get() ?? null
  );
}

export function getCollectionBySlug(db: DB, slug: string) {
  return (
    db.select().from(schema.collections).where(eq(schema.collections.slug, slug)).get() ?? null
  );
}

// Actor must own the collection (or be an admin). Cascade deletes remove member rows.
export function deleteCollection(
  db: DB,
  actor: Actor,
  id: string,
): { ok: boolean; error?: string } {
  const coll = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  if (!coll) return { ok: false, error: "Collection not found." };
  if (coll.ownerUserId !== actor.userId && !isAdmin(actor)) {
    return { ok: false, error: "You can only delete your own collections." };
  }
  db.delete(schema.collections).where(eq(schema.collections.id, id)).run();
  return { ok: true };
}

// ── Link membership ───────────────────────────────────────────────────────────

// Returns ordered member links for a collection, joined with link metadata.
export function getCollectionLinks(db: DB, collectionId: string) {
  return db
    .select({
      id: schema.collectionLinks.id,
      linkId: schema.collectionLinks.linkId,
      position: schema.collectionLinks.position,
      slug: schema.links.slug,
      title: schema.links.title,
    })
    .from(schema.collectionLinks)
    .innerJoin(schema.links, eq(schema.collectionLinks.linkId, schema.links.id))
    .where(eq(schema.collectionLinks.collectionId, collectionId))
    .orderBy(asc(schema.collectionLinks.position), asc(schema.collectionLinks.id))
    .all();
}

// Enforces: actor must own the collection AND own the link being added.
export function addLinkToCollection(
  db: DB,
  actor: Actor,
  collectionId: string,
  linkId: string,
): { ok: boolean; error?: string } {
  // Collection must exist and actor must be its owner.
  const coll = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();
  if (!coll) return { ok: false, error: "Collection not found." };
  if (coll.ownerUserId !== actor.userId && !isAdmin(actor)) {
    return { ok: false, error: "You can only edit your own collections." };
  }

  // Link must exist and actor must own it.
  const link = db
    .select({ ownerUserId: schema.links.ownerUserId })
    .from(schema.links)
    .where(eq(schema.links.id, linkId))
    .get();
  if (!link) return { ok: false, error: "Link not found." };
  if (link.ownerUserId !== actor.userId && !isAdmin(actor)) {
    return { ok: false, error: "You can only add your own links." };
  }

  // Prevent duplicates.
  const existing = db
    .select({ id: schema.collectionLinks.id })
    .from(schema.collectionLinks)
    .where(
      and(
        eq(schema.collectionLinks.collectionId, collectionId),
        eq(schema.collectionLinks.linkId, linkId),
      ),
    )
    .get();
  if (existing) return { ok: false, error: "Link is already in this collection." };

  // Position = max existing + 1 (or 0 when collection is empty).
  const last = db
    .select({ position: schema.collectionLinks.position })
    .from(schema.collectionLinks)
    .where(eq(schema.collectionLinks.collectionId, collectionId))
    .orderBy(desc(schema.collectionLinks.position))
    .limit(1)
    .get();

  const position = last ? last.position + 1 : 0;
  db.insert(schema.collectionLinks)
    .values({ id: nanoid(), collectionId, linkId, position })
    .run();
  return { ok: true };
}

// Actor must own the collection.
export function removeLinkFromCollection(
  db: DB,
  actor: Actor,
  collectionId: string,
  linkId: string,
): { ok: boolean; error?: string } {
  const coll = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();
  if (!coll) return { ok: false, error: "Collection not found." };
  if (coll.ownerUserId !== actor.userId && !isAdmin(actor)) {
    return { ok: false, error: "You can only edit your own collections." };
  }
  db.delete(schema.collectionLinks)
    .where(
      and(
        eq(schema.collectionLinks.collectionId, collectionId),
        eq(schema.collectionLinks.linkId, linkId),
      ),
    )
    .run();
  return { ok: true };
}

// Swaps the target link with its neighbour in the given direction.
// A move that would exceed the list boundary is a no-op (not an error).
export function moveLinkInCollection(
  db: DB,
  actor: Actor,
  collectionId: string,
  linkId: string,
  direction: "up" | "down",
): { ok: boolean; error?: string } {
  const coll = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();
  if (!coll) return { ok: false, error: "Collection not found." };
  if (coll.ownerUserId !== actor.userId && !isAdmin(actor)) {
    return { ok: false, error: "You can only edit your own collections." };
  }

  const items = db
    .select({
      id: schema.collectionLinks.id,
      linkId: schema.collectionLinks.linkId,
      position: schema.collectionLinks.position,
    })
    .from(schema.collectionLinks)
    .where(eq(schema.collectionLinks.collectionId, collectionId))
    .orderBy(asc(schema.collectionLinks.position), asc(schema.collectionLinks.id))
    .all();

  const idx = items.findIndex((item) => item.linkId === linkId);
  if (idx === -1) return { ok: false, error: "Link not in collection." };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return { ok: true }; // Boundary — no-op.

  const a = items[idx];
  const b = items[swapIdx];

  db.update(schema.collectionLinks)
    .set({ position: b.position })
    .where(eq(schema.collectionLinks.id, a.id))
    .run();
  db.update(schema.collectionLinks)
    .set({ position: a.position })
    .where(eq(schema.collectionLinks.id, b.id))
    .run();

  return { ok: true };
}

// ── Public ────────────────────────────────────────────────────────────────────

// Returns the collection and its ordered member links for the public route.
// Returns null if no collection exists for the given slug.
export function getPublicCollectionWithLinks(db: DB, slug: string) {
  const collection = getCollectionBySlug(db, slug);
  if (!collection) return null;
  const links = getCollectionLinks(db, collection.id);
  return { collection, links };
}
