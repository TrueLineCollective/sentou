import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { getStore } from "@/lib/server-store";
import * as schema from "@/lib/db/schema";
import {
  createCollection,
  getCollectionsForUser,
  getCollectionById,
  getCollectionBySlug,
  deleteCollection,
  getCollectionLinks,
  addLinkToCollection,
  removeLinkFromCollection,
  moveLinkInCollection,
  getPublicCollectionWithLinks,
} from "@/lib/collections";
import type { Actor } from "@/lib/auth-session";

// ── Fixtures ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SENTOU_DB = path.join(
    mkdtempSync(path.join(tmpdir(), "sentou-coll-")),
    "db.sqlite",
  );
  getStore();
  migrate(getDb(), { migrationsFolder: "lib/db/migrations" });
});

function seedUser(id: string, email: string) {
  const db = getDb();
  const now = new Date();
  db.insert(schema.user)
    .values({ id, name: "User", email, emailVerified: false, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .run();
  return { id, email };
}

function seedLink(id: string, slug: string, ownerUserId: string) {
  const db = getDb();
  const now = new Date().toISOString();
  db.insert(schema.links)
    .values({
      id,
      slug,
      ownerUserId,
      title: `Link ${slug}`,
      requireEmail: false,
      allowedDomains: null,
      expiresAt: null,
      revoked: false,
      verifyEmail: false,
      verifyAttempts: {},
      track: false,
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();
  return { id, slug, ownerUserId };
}

function ownerActor(userId: string): Actor {
  return { userId, role: "owner" };
}

function memberActor(userId: string): Actor {
  return { userId, role: "member" };
}

function adminActor(userId: string): Actor {
  return { userId, role: "admin" };
}

// ── createCollection ──────────────────────────────────────────────────────────

describe("createCollection", () => {
  it("creates a collection and returns it with a unique slug", () => {
    const { id: userId } = seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, userId, "My Bundle");
    expect(c.title).toBe("My Bundle");
    expect(c.slug).toBeTruthy();
    expect(c.ownerUserId).toBe(userId);
    expect(c.id).toBeTruthy();
  });

  it("generates distinct slugs for two collections", () => {
    const { id: userId } = seedUser("u1", "u1@x.com");
    const db = getDb();
    const a = createCollection(db, userId, "A");
    const b = createCollection(db, userId, "B");
    expect(a.slug).not.toBe(b.slug);
  });
});

// ── getCollectionsForUser ─────────────────────────────────────────────────────

describe("getCollectionsForUser", () => {
  it("returns only the owner's collections when not admin", () => {
    seedUser("u1", "u1@x.com");
    seedUser("u2", "u2@x.com");
    const db = getDb();
    createCollection(db, "u1", "U1 Bundle");
    createCollection(db, "u2", "U2 Bundle");

    const forU1 = getCollectionsForUser(db, "u1", false);
    expect(forU1).toHaveLength(1);
    expect(forU1[0].title).toBe("U1 Bundle");
  });

  it("returns all collections for an admin", () => {
    seedUser("u1", "u1@x.com");
    seedUser("u2", "u2@x.com");
    const db = getDb();
    createCollection(db, "u1", "U1 Bundle");
    createCollection(db, "u2", "U2 Bundle");

    const all = getCollectionsForUser(db, "u1", true);
    expect(all).toHaveLength(2);
  });

  it("includes a correct linkCount", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "Counted");
    seedLink("L1", "sl1", "u1");
    seedLink("L2", "sl2", "u1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L2");

    const [result] = getCollectionsForUser(db, "u1", false);
    expect(result.linkCount).toBe(2);
  });
});

// ── getCollectionById / getCollectionBySlug ───────────────────────────────────

describe("getCollectionById", () => {
  it("returns the collection by id", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "Find Me");
    const found = getCollectionById(db, c.id);
    expect(found?.id).toBe(c.id);
  });

  it("returns null for a missing id", () => {
    const db = getDb();
    expect(getCollectionById(db, "nope")).toBeNull();
  });
});

describe("getCollectionBySlug", () => {
  it("returns the collection by slug", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "Slug Test");
    const found = getCollectionBySlug(db, c.slug);
    expect(found?.id).toBe(c.id);
  });

  it("returns null for an unknown slug", () => {
    const db = getDb();
    expect(getCollectionBySlug(db, "does-not-exist")).toBeNull();
  });
});

// ── deleteCollection ──────────────────────────────────────────────────────────

describe("deleteCollection", () => {
  it("owner can delete their own collection", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "To Delete");
    const result = deleteCollection(db, ownerActor("u1"), c.id);
    expect(result.ok).toBe(true);
    expect(getCollectionById(db, c.id)).toBeNull();
  });

  it("non-owner (member role) cannot delete another user's collection", () => {
    seedUser("u1", "u1@x.com");
    seedUser("u2", "u2@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "U1 Coll");
    const result = deleteCollection(db, memberActor("u2"), c.id);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own/i);
    expect(getCollectionById(db, c.id)).not.toBeNull();
  });

  it("admin can delete any collection", () => {
    seedUser("u1", "u1@x.com");
    seedUser("u2", "u2@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "U1 Coll");
    const result = deleteCollection(db, adminActor("u2"), c.id);
    expect(result.ok).toBe(true);
    expect(getCollectionById(db, c.id)).toBeNull();
  });

  it("returns error for a missing collection", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const result = deleteCollection(db, ownerActor("u1"), "ghost");
    expect(result.ok).toBe(false);
  });
});

// ── addLinkToCollection ───────────────────────────────────────────────────────

describe("addLinkToCollection", () => {
  it("owner can add their own link to their collection", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "My Coll");
    seedLink("L1", "sl1", "u1");
    const result = addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    expect(result.ok).toBe(true);
    const members = getCollectionLinks(db, c.id);
    expect(members).toHaveLength(1);
    expect(members[0].linkId).toBe("L1");
  });

  it("cannot add another owner's link — enforced at lib level", () => {
    seedUser("u1", "u1@x.com");
    seedUser("u2", "u2@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "U1 Coll");
    seedLink("L_u2", "sl-u2", "u2"); // link owned by u2
    const result = addLinkToCollection(db, memberActor("u1"), c.id, "L_u2");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own links/i);
  });

  it("cannot edit another user's collection — enforced at lib level", () => {
    seedUser("u1", "u1@x.com");
    seedUser("u2", "u2@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "U1 Coll");
    seedLink("L_u2", "sl-u2", "u2");
    // u2 tries to add to u1's collection
    const result = addLinkToCollection(db, memberActor("u2"), c.id, "L_u2");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own collection/i);
  });

  it("admin can add any link to any collection", () => {
    seedUser("u1", "u1@x.com");
    seedUser("u2", "u2@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "U1 Coll");
    seedLink("L_u2", "sl-u2", "u2");
    const result = addLinkToCollection(db, adminActor("u2"), c.id, "L_u2");
    expect(result.ok).toBe(true);
  });

  it("prevents adding the same link twice", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "My Coll");
    seedLink("L1", "sl1", "u1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    const dup = addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/already/i);
  });

  it("assigns ascending positions to links added in sequence", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "My Coll");
    seedLink("L1", "sl1", "u1");
    seedLink("L2", "sl2", "u1");
    seedLink("L3", "sl3", "u1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L2");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L3");
    const members = getCollectionLinks(db, c.id);
    expect(members.map((m) => m.position)).toEqual([0, 1, 2]);
  });
});

// ── removeLinkFromCollection ──────────────────────────────────────────────────

describe("removeLinkFromCollection", () => {
  it("owner can remove a link from their collection", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "My Coll");
    seedLink("L1", "sl1", "u1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    const result = removeLinkFromCollection(db, ownerActor("u1"), c.id, "L1");
    expect(result.ok).toBe(true);
    expect(getCollectionLinks(db, c.id)).toHaveLength(0);
  });

  it("non-owner cannot remove from another user's collection", () => {
    seedUser("u1", "u1@x.com");
    seedUser("u2", "u2@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "U1 Coll");
    seedLink("L1", "sl1", "u1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    const result = removeLinkFromCollection(db, memberActor("u2"), c.id, "L1");
    expect(result.ok).toBe(false);
    expect(getCollectionLinks(db, c.id)).toHaveLength(1);
  });
});

// ── moveLinkInCollection ──────────────────────────────────────────────────────

describe("moveLinkInCollection", () => {
  function setupThreeLinks() {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "Ordered");
    seedLink("L1", "s1", "u1");
    seedLink("L2", "s2", "u1");
    seedLink("L3", "s3", "u1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L2");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L3");
    return { db, cId: c.id };
  }

  it("moves a link up correctly", () => {
    const { db, cId } = setupThreeLinks();
    moveLinkInCollection(db, ownerActor("u1"), cId, "L2", "up");
    const members = getCollectionLinks(db, cId);
    expect(members.map((m) => m.linkId)).toEqual(["L2", "L1", "L3"]);
  });

  it("moves a link down correctly", () => {
    const { db, cId } = setupThreeLinks();
    moveLinkInCollection(db, ownerActor("u1"), cId, "L1", "down");
    const members = getCollectionLinks(db, cId);
    expect(members.map((m) => m.linkId)).toEqual(["L2", "L1", "L3"]);
  });

  it("move up at top boundary is a no-op", () => {
    const { db, cId } = setupThreeLinks();
    const result = moveLinkInCollection(db, ownerActor("u1"), cId, "L1", "up");
    expect(result.ok).toBe(true);
    const members = getCollectionLinks(db, cId);
    expect(members.map((m) => m.linkId)).toEqual(["L1", "L2", "L3"]);
  });

  it("move down at bottom boundary is a no-op", () => {
    const { db, cId } = setupThreeLinks();
    const result = moveLinkInCollection(db, ownerActor("u1"), cId, "L3", "down");
    expect(result.ok).toBe(true);
    const members = getCollectionLinks(db, cId);
    expect(members.map((m) => m.linkId)).toEqual(["L1", "L2", "L3"]);
  });

  it("non-owner cannot reorder another user's collection", () => {
    const { db, cId } = setupThreeLinks();
    seedUser("u2", "u2@x.com");
    const result = moveLinkInCollection(db, memberActor("u2"), cId, "L2", "up");
    expect(result.ok).toBe(false);
    const members = getCollectionLinks(db, cId);
    expect(members.map((m) => m.linkId)).toEqual(["L1", "L2", "L3"]);
  });
});

// ── getPublicCollectionWithLinks ──────────────────────────────────────────────

describe("getPublicCollectionWithLinks", () => {
  it("returns the collection and its ordered links by slug", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "Public Bundle");
    seedLink("L1", "pub1", "u1");
    seedLink("L2", "pub2", "u1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L2");

    const result = getPublicCollectionWithLinks(db, c.slug);
    expect(result).not.toBeNull();
    expect(result!.collection.id).toBe(c.id);
    expect(result!.links).toHaveLength(2);
    expect(result!.links.map((l) => l.linkId)).toEqual(["L1", "L2"]);
  });

  it("returns null for an unknown slug", () => {
    const db = getDb();
    expect(getPublicCollectionWithLinks(db, "no-such-slug")).toBeNull();
  });

  it("returns links in position order, not insertion order", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "Ordered");
    seedLink("L1", "s1", "u1");
    seedLink("L2", "s2", "u1");
    seedLink("L3", "s3", "u1");
    addLinkToCollection(db, ownerActor("u1"), c.id, "L1"); // pos 0
    addLinkToCollection(db, ownerActor("u1"), c.id, "L2"); // pos 1
    addLinkToCollection(db, ownerActor("u1"), c.id, "L3"); // pos 2
    // Move L3 to the front
    moveLinkInCollection(db, ownerActor("u1"), c.id, "L3", "up");
    moveLinkInCollection(db, ownerActor("u1"), c.id, "L3", "up");

    const result = getPublicCollectionWithLinks(db, c.slug);
    expect(result!.links.map((l) => l.linkId)).toEqual(["L3", "L1", "L2"]);
  });

  it("lists all stops regardless of link gate status (gate enforced at /v/<slug>)", () => {
    seedUser("u1", "u1@x.com");
    const db = getDb();
    const c = createCollection(db, "u1", "Mixed");
    // Seed a revoked link
    const now = new Date().toISOString();
    db.insert(schema.links)
      .values({
        id: "REVOKED",
        slug: "rvk",
        ownerUserId: "u1",
        title: "Revoked Link",
        requireEmail: false,
        allowedDomains: null,
        expiresAt: null,
        revoked: true, // revoked
        verifyEmail: false,
        verifyAttempts: {},
        track: false,
        createdAt: now,
      })
      .run();
    addLinkToCollection(db, ownerActor("u1"), c.id, "REVOKED");

    const result = getPublicCollectionWithLinks(db, c.slug);
    // Public collection lists revoked links too; the viewer gate handles them at /v/<slug>
    expect(result!.links).toHaveLength(1);
    expect(result!.links[0].linkId).toBe("REVOKED");
  });
});
