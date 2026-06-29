import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { __resetRateLimits } from "@/lib/rate-limit";

// Each test sets its own SENTOU_DB before importing routes; the store module
// re-binds when SENTOU_DB changes (server-store.ts checks the path).
beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "t.db");
  process.env.BETTER_AUTH_SECRET = "test-secret-sentou-dev-only-not-for-production";
  __resetRateLimits();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();  // clear module cache so each test gets a fresh auth singleton
});

describe("owner auth", () => {
  it("allows publish in dev/local with no actor (owner null)", async () => {
    const { POST } = await import("@/app/api/publish/route");
    const res = await POST(
      new Request("http://t/api/publish", {
        method: "POST",
        body: JSON.stringify({ html: "<h1>x</h1>" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // In dev with no actor, ownerUserId is null; the link is created without an owner.
    expect(typeof body.id).toBe("string");
  });

  it("denies publish in production when no actor is present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/publish/route");
    const res = await POST(
      new Request("http://t/api/publish", {
        method: "POST",
        body: JSON.stringify({ html: "<h1>x</h1>" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("allows publish with a valid API key and stamps ownerUserId on the created link", async () => {
    // Prepare DB with a user + member + apiKey row.
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const orgId = randomUUID();
    db.insert(schema.organization).values({
      id: orgId, name: "Workspace", slug: "workspace", createdAt: new Date(),
    }).run();

    const userId = randomUUID();
    db.insert(schema.user).values({
      id: userId, name: "Alice", email: "alice@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    db.insert(schema.member).values({
      id: randomUUID(), organizationId: orgId, userId, role: "owner", createdAt: new Date(),
    }).run();

    const rawKey = "sentou_owner_" + randomUUID().replace(/-/g, "");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    db.insert(schema.apiKey).values({
      id: randomUUID(), userId, name: "owner key",
      keyHash, prefix: rawKey.slice(0, 8),
      createdAt: new Date(), enabled: true,
    }).run();

    const { POST } = await import("@/app/api/publish/route");
    const res = await POST(
      new Request("http://t/api/publish", {
        method: "POST",
        headers: { authorization: `Bearer ${rawKey}` },
        body: JSON.stringify({ html: "<h1>owned</h1>" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.id).toBe("string");

    // Verify ownerUserId was stamped on the links row.
    const allLinks = db
      .select({ id: schema.links.id, ownerUserId: schema.links.ownerUserId })
      .from(schema.links)
      .all();
    const row = allLinks.find((r) => r.id === body.id);
    expect(row?.ownerUserId).toBe(userId);
  });

  it("requireOwner fails closed in production when no actor (error mentions production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { requireOwner } = await import("@/lib/owner");
    await expect(requireOwner(new Request("http://t/api/publish"))).rejects.toThrow(/production/);
  });

  it("requireOwner fails closed when BETTER_AUTH_URL points to a non-localhost host", async () => {
    process.env.BETTER_AUTH_URL = "https://sentou.example.com";
    const { requireOwner } = await import("@/lib/owner");
    await expect(requireOwner(new Request("http://t/api/publish"))).rejects.toThrow();
    delete process.env.BETTER_AUTH_URL;
  });
});

describe("ownership enforcement", () => {
  it("actor A cannot view stats for a link owned by actor B", async () => {
    // Set up DB with two users.
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const orgId = randomUUID();
    db.insert(schema.organization).values({
      id: orgId, name: "Workspace", slug: "workspace", createdAt: new Date(),
    }).run();

    // Actor A (owner)
    const userA = randomUUID();
    db.insert(schema.user).values({
      id: userA, name: "Alice", email: "alice@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    db.insert(schema.member).values({
      id: randomUUID(), organizationId: orgId, userId: userA, role: "owner", createdAt: new Date(),
    }).run();
    const keyA = "sentou_a_" + randomUUID().replace(/-/g, "");
    db.insert(schema.apiKey).values({
      id: randomUUID(), userId: userA, name: "a key",
      keyHash: createHash("sha256").update(keyA).digest("hex"),
      prefix: keyA.slice(0, 8), createdAt: new Date(), enabled: true,
    }).run();

    // Actor B (member)
    const userB = randomUUID();
    db.insert(schema.user).values({
      id: userB, name: "Bob", email: "bob@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    db.insert(schema.member).values({
      id: randomUUID(), organizationId: orgId, userId: userB, role: "member", createdAt: new Date(),
    }).run();
    const keyB = "sentou_b_" + randomUUID().replace(/-/g, "");
    db.insert(schema.apiKey).values({
      id: randomUUID(), userId: userB, name: "b key",
      keyHash: createHash("sha256").update(keyB).digest("hex"),
      prefix: keyB.slice(0, 8), createdAt: new Date(), enabled: true,
    }).run();

    // Actor A publishes a link.
    const { POST: publishPost } = await import("@/app/api/publish/route");
    const publishRes = await publishPost(
      new Request("http://t/api/publish", {
        method: "POST",
        headers: { authorization: `Bearer ${keyA}` },
        body: JSON.stringify({ html: "<h1>alice's link</h1>" }),
      }),
    );
    expect(publishRes.status).toBe(200);
    const { id } = await publishRes.json() as { id: string };

    // Actor B tries to view stats for that link — must be 403.
    const { GET: statsGet } = await import("@/app/api/stats/route");
    const statsRes = await statsGet(
      new Request(`http://t/api/stats?id=${id}`, {
        headers: { authorization: `Bearer ${keyB}` },
      }),
    );
    expect(statsRes.status).toBe(403);

    // Actor A (owner role) can view their own link's stats.
    const ownStatsRes = await statsGet(
      new Request(`http://t/api/stats?id=${id}`, {
        headers: { authorization: `Bearer ${keyA}` },
      }),
    );
    expect(ownStatsRes.status).toBe(200);
  });

  it("owner-role actor can view any link regardless of ownerUserId", async () => {
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const orgId = randomUUID();
    db.insert(schema.organization).values({
      id: orgId, name: "Workspace", slug: "workspace", createdAt: new Date(),
    }).run();

    // Actor A (member) creates a link
    const userA = randomUUID();
    db.insert(schema.user).values({
      id: userA, name: "Alice", email: "alice@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    db.insert(schema.member).values({
      id: randomUUID(), organizationId: orgId, userId: userA, role: "member", createdAt: new Date(),
    }).run();
    const keyA = "sentou_a2_" + randomUUID().replace(/-/g, "");
    db.insert(schema.apiKey).values({
      id: randomUUID(), userId: userA, name: "a key",
      keyHash: createHash("sha256").update(keyA).digest("hex"),
      prefix: keyA.slice(0, 8), createdAt: new Date(), enabled: true,
    }).run();

    // Admin actor (owner role) can view all links
    const adminId = randomUUID();
    db.insert(schema.user).values({
      id: adminId, name: "Admin", email: "admin@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    db.insert(schema.member).values({
      id: randomUUID(), organizationId: orgId, userId: adminId, role: "owner", createdAt: new Date(),
    }).run();
    const adminKey = "sentou_admin_" + randomUUID().replace(/-/g, "");
    db.insert(schema.apiKey).values({
      id: randomUUID(), userId: adminId, name: "admin key",
      keyHash: createHash("sha256").update(adminKey).digest("hex"),
      prefix: adminKey.slice(0, 8), createdAt: new Date(), enabled: true,
    }).run();

    // Alice publishes a link (member role).
    const { POST: publishPost } = await import("@/app/api/publish/route");
    const publishRes = await publishPost(
      new Request("http://t/api/publish", {
        method: "POST",
        headers: { authorization: `Bearer ${keyA}` },
        body: JSON.stringify({ html: "<h1>alice link</h1>" }),
      }),
    );
    expect(publishRes.status).toBe(200);
    const { id } = await publishRes.json() as { id: string };

    // Admin (owner role) views Alice's link — must succeed.
    const { GET: statsGet } = await import("@/app/api/stats/route");
    const statsRes = await statsGet(
      new Request(`http://t/api/stats?id=${id}`, {
        headers: { authorization: `Bearer ${adminKey}` },
      }),
    );
    expect(statsRes.status).toBe(200);
  });
});
