import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { __resetRateLimits } from "@/lib/rate-limit";

// Extracts the better-auth session token from a Set-Cookie response header.
function extractCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match ? match[1] : null;
}

// Inserts a minimal workspace org + two actors (owner + member) with API keys
// and both a null-owner link and an owned link into the current SENTOU_DB.
// Returns enough to drive endpoint tests.
function setupTwoActors() {
  const dbFile = process.env.SENTOU_DB!;
  const db = getDb(dbFile);
  migrate(db, { migrationsFolder: "lib/db/migrations" });

  const orgId = randomUUID();
  // Explicit early createdAt so this is always the "workspace" org (oldest).
  db.insert(schema.organization).values({
    id: orgId, name: "Workspace", slug: "workspace",
    createdAt: new Date(1),
  }).run();

  // Owner actor
  const userA = randomUUID();
  db.insert(schema.user).values({
    id: userA, name: "Alice", email: "alice@example.com",
    emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
  }).run();
  db.insert(schema.member).values({
    id: randomUUID(), organizationId: orgId, userId: userA, role: "owner", createdAt: new Date(),
  }).run();
  const keyA = "sentou_ta_" + randomUUID().replace(/-/g, "");
  db.insert(schema.apiKey).values({
    id: randomUUID(), userId: userA, name: "owner key",
    keyHash: createHash("sha256").update(keyA).digest("hex"),
    prefix: "ta_prefix", createdAt: new Date(), enabled: true,
  }).run();

  // Member actor
  const userB = randomUUID();
  db.insert(schema.user).values({
    id: userB, name: "Bob", email: "bob@example.com",
    emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
  }).run();
  db.insert(schema.member).values({
    id: randomUUID(), organizationId: orgId, userId: userB, role: "member", createdAt: new Date(),
  }).run();
  const keyB = "sentou_tb_" + randomUUID().replace(/-/g, "");
  db.insert(schema.apiKey).values({
    id: randomUUID(), userId: userB, name: "member key",
    keyHash: createHash("sha256").update(keyB).digest("hex"),
    prefix: "tb_prefix", createdAt: new Date(), enabled: true,
  }).run();

  // Null-owner link (legacy/imported)
  const nullLinkId = randomUUID();
  db.insert(schema.links).values({
    id: nullLinkId, slug: "null-" + nullLinkId.slice(0, 8), ownerUserId: null,
    createdAt: new Date().toISOString(),
  }).run();

  // Owned link (belongs to Alice/userA)
  const ownedLinkId = randomUUID();
  db.insert(schema.links).values({
    id: ownedLinkId, slug: "owned-" + ownedLinkId.slice(0, 8), ownerUserId: userA,
    createdAt: new Date().toISOString(),
  }).run();

  return { db, userA, userB, keyA, keyB, nullLinkId, ownedLinkId };
}

// Signs up Alice (first user → owner bootstrap), invites Bob, signs up Bob.
// Returns session cookies for both actors and Alice's userId.
// Caller must have already migrated the DB.
async function setupWithSessions(db: ReturnType<typeof getDb>) {
  const { auth } = await import("@/lib/auth");

  const aliceResp = await auth.api.signUpEmail({
    body: { name: "Alice", email: "alice@example.com", password: "hunter2-but-longer-ok" },
    headers: new Headers({ host: "localhost:3000" }),
    asResponse: true,
  }) as Response;
  expect(aliceResp.status).toBe(200);
  const aliceCookie = extractCookie(aliceResp.headers.get("set-cookie"));

  // Get workspace org (only org at this point)
  const orgs = db.select({ id: schema.organization.id }).from(schema.organization).all();
  const orgId = orgs[0].id;

  // Alice invites Bob as member
  const inviteResp = await auth.api.createInvitation({
    body: { email: "bob@example.com", role: "member", organizationId: orgId },
    headers: new Headers({
      host: "localhost:3000",
      cookie: `better-auth.session_token=${aliceCookie}`,
    }),
    asResponse: true,
  }) as Response;
  expect(inviteResp.status).toBe(200);

  // Bob signs up with the invite
  const bobResp = await auth.api.signUpEmail({
    body: { name: "Bob", email: "bob@example.com", password: "hunter2-but-longer-ok" },
    headers: new Headers({ host: "localhost:3000" }),
    asResponse: true,
  }) as Response;
  expect(bobResp.status).toBe(200);
  const bobCookie = extractCookie(bobResp.headers.get("set-cookie"));

  // Capture Alice's userId from the users table (only Alice was first)
  const users = db.select({ id: schema.user.id, email: schema.user.email }).from(schema.user).all();
  const aliceRow = users.find((u) => u.email === "alice@example.com");

  return { aliceCookie: aliceCookie!, bobCookie: bobCookie!, aliceUserId: aliceRow!.id };
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1: null-owner links must not fail open for ordinary members
// ─────────────────────────────────────────────────────────────────────────────

describe("null-owner link — member blocked, admin allowed (fix 1)", () => {
  it("member API key gets 403 on a null-owner link — stats", async () => {
    const { keyB, nullLinkId } = setupTwoActors();
    const { GET: statsGet } = await import("@/app/api/stats/route");
    const res = await statsGet(new Request(`http://t/api/stats?id=${nullLinkId}`, {
      headers: { authorization: `Bearer ${keyB}` },
    }));
    expect(res.status).toBe(403);
  });

  it("member API key gets 403 on a null-owner link — forget", async () => {
    const { keyB, nullLinkId } = setupTwoActors();
    const { POST: forgetPost } = await import("@/app/api/forget/route");
    const res = await forgetPost(new Request("http://t/api/forget", {
      method: "POST",
      headers: { authorization: `Bearer ${keyB}` },
      body: JSON.stringify({ id: nullLinkId }),
    }));
    expect(res.status).toBe(403);
  });

  it("member API key gets 403 on a null-owner link — revoke", async () => {
    const { keyB, nullLinkId } = setupTwoActors();
    const { POST: revokePost } = await import("@/app/api/revoke/route");
    const res = await revokePost(new Request("http://t/api/revoke", {
      method: "POST",
      headers: { authorization: `Bearer ${keyB}` },
      body: JSON.stringify({ id: nullLinkId }),
    }));
    expect(res.status).toBe(403);
  });

  it("member API key gets 403 on a null-owner link — republish", async () => {
    const { keyB, nullLinkId } = setupTwoActors();
    const { POST: republishPost } = await import("@/app/api/republish/route");
    const res = await republishPost(new Request("http://t/api/republish", {
      method: "POST",
      headers: { authorization: `Bearer ${keyB}` },
      body: JSON.stringify({ id: nullLinkId, html: "<h1>x</h1>" }),
    }));
    expect(res.status).toBe(403);
  });

  it("admin (owner role) API key gets 200 on a null-owner link — stats", async () => {
    const { keyA, nullLinkId } = setupTwoActors();
    const { GET: statsGet } = await import("@/app/api/stats/route");
    const res = await statsGet(new Request(`http://t/api/stats?id=${nullLinkId}`, {
      headers: { authorization: `Bearer ${keyA}` },
    }));
    expect(res.status).toBe(200);
  });

  // IDOR: member uses a session cookie to access a null-owner link.
  it("member session cookie gets 403 on a null-owner link (IDOR — session path)", async () => {
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const { bobCookie } = await setupWithSessions(db);

    // Insert a null-owner link directly.
    const nullLinkId = randomUUID();
    db.insert(schema.links).values({
      id: nullLinkId, slug: "ses-null-" + nullLinkId.slice(0, 8), ownerUserId: null,
      createdAt: new Date().toISOString(),
    }).run();

    const { GET: statsGet } = await import("@/app/api/stats/route");
    const res = await statsGet(new Request(`http://t/api/stats?id=${nullLinkId}`, {
      headers: { cookie: `better-auth.session_token=${bobCookie}` },
    }));
    expect(res.status).toBe(403);
  });

  // IDOR: member uses a session cookie to access another user's owned link.
  it("member session cookie gets 403 on another user's owned link (IDOR — session path)", async () => {
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const { aliceCookie, bobCookie, aliceUserId } = await setupWithSessions(db);

    // Alice publishes a link via the publish route (stamps ownerUserId=aliceUserId).
    const { POST: publishPost } = await import("@/app/api/publish/route");
    const publishRes = await publishPost(new Request("http://t/api/publish", {
      method: "POST",
      headers: { cookie: `better-auth.session_token=${aliceCookie}` },
      body: JSON.stringify({ html: "<h1>alice owns this</h1>" }),
    }));
    expect(publishRes.status).toBe(200);
    const { id: linkId } = await publishRes.json() as { id: string };

    // Verify the link is stamped with Alice's userId.
    const linkRow = db.select({ ownerUserId: schema.links.ownerUserId }).from(schema.links).all().find((r) => r.ownerUserId !== null);
    expect(linkRow?.ownerUserId).toBe(aliceUserId);

    // Bob (member, different user) tries to get stats — must be 403.
    const { GET: statsGet } = await import("@/app/api/stats/route");
    const res = await statsGet(new Request(`http://t/api/stats?id=${linkId}`, {
      headers: { cookie: `better-auth.session_token=${bobCookie}` },
    }));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2: API key creation endpoint round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe("API key creation endpoint (fix 2)", () => {
  it("POST /api/keys returns key, prefix, name for authenticated user", async () => {
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const { aliceCookie } = await setupWithSessions(db);

    const { POST: keysPost } = await import("@/app/api/keys/route");
    const res = await keysPost(new Request("http://t/api/keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `better-auth.session_token=${aliceCookie}`,
      },
      body: JSON.stringify({ name: "my-test-key" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { key: string; prefix: string; name: string };
    expect(typeof body.key).toBe("string");
    expect(body.key.startsWith("sentou_")).toBe(true);
    expect(body.key.length).toBeGreaterThan(40);
    expect(typeof body.prefix).toBe("string");
    expect(body.prefix.length).toBeGreaterThan(0);
    // Prefix must NOT be the "sentou_" brand string.
    expect(body.prefix).not.toBe("sentou_k");
    expect(body.name).toBe("my-test-key");
  });

  it("created key authenticates through getActor (round-trip)", async () => {
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const { aliceCookie } = await setupWithSessions(db);

    // Create a key via the endpoint.
    const { POST: keysPost } = await import("@/app/api/keys/route");
    const createRes = await keysPost(new Request("http://t/api/keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `better-auth.session_token=${aliceCookie}`,
      },
      body: JSON.stringify({ name: "round-trip" }),
    }));
    expect(createRes.status).toBe(200);
    const { key } = await createRes.json() as { key: string };

    // Use the returned key to authenticate via getActor.
    const { getActor } = await import("@/lib/auth-session");
    const actor = await getActor(new Request("http://t/api/stats", {
      headers: { authorization: `Bearer ${key}` },
    }));
    expect(actor).not.toBeNull();
    expect(typeof actor?.userId).toBe("string");
    expect(actor?.role).toBe("owner"); // Alice is owner (first user)
  });

  it("tampered key is rejected by getActor", async () => {
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const { aliceCookie } = await setupWithSessions(db);

    const { POST: keysPost } = await import("@/app/api/keys/route");
    const createRes = await keysPost(new Request("http://t/api/keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `better-auth.session_token=${aliceCookie}`,
      },
      body: JSON.stringify({ name: "tamper-test" }),
    }));
    const { key } = await createRes.json() as { key: string };

    // Tamper the key by flipping one character.
    const tampered = key.slice(0, -1) + (key.endsWith("a") ? "b" : "a");

    const { getActor } = await import("@/lib/auth-session");
    const actor = await getActor(new Request("http://t/api/stats", {
      headers: { authorization: `Bearer ${tampered}` },
    }));
    expect(actor).toBeNull();
  });

  it("POST /api/keys returns 401 when no actor (dev open mode, not production)", async () => {
    // No DB setup needed — no auth headers means getActor returns null.
    const { POST: keysPost } = await import("@/app/api/keys/route");
    const res = await keysPost(new Request("http://t/api/keys", {
      method: "POST",
      body: JSON.stringify({ name: "fail" }),
    }));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3: role is scoped to the workspace org
// ─────────────────────────────────────────────────────────────────────────────

describe("role scoped to workspace org (fix 3)", () => {
  it("member role is 'member' even when user has owner row in a second org", async () => {
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    // Workspace org (created first — will be "oldest")
    const workspaceOrgId = randomUUID();
    db.insert(schema.organization).values({
      id: workspaceOrgId, name: "Workspace", slug: "workspace",
      createdAt: new Date(1),
    }).run();

    const userId = randomUUID();
    db.insert(schema.user).values({
      id: userId, name: "Bob", email: "bob@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    // Bob is "member" in the workspace org.
    db.insert(schema.member).values({
      id: randomUUID(), organizationId: workspaceOrgId, userId, role: "member", createdAt: new Date(1),
    }).run();

    // A second org where Bob happens to have an "owner" row.
    const secondOrgId = randomUUID();
    db.insert(schema.organization).values({
      id: secondOrgId, name: "Second Org", slug: "second-org",
      createdAt: new Date(2),
    }).run();
    db.insert(schema.member).values({
      id: randomUUID(), organizationId: secondOrgId, userId, role: "owner", createdAt: new Date(2),
    }).run();

    // Bob's API key
    const rawKey = "sentou_scoped_" + randomUUID().replace(/-/g, "");
    db.insert(schema.apiKey).values({
      id: randomUUID(), userId, name: "bob key",
      keyHash: createHash("sha256").update(rawKey).digest("hex"),
      prefix: "sc_pfx", createdAt: new Date(), enabled: true,
    }).run();

    // Insert a null-owner link that only admins can access.
    const nullLinkId = randomUUID();
    db.insert(schema.links).values({
      id: nullLinkId, slug: "scoped-null-" + nullLinkId.slice(0, 8), ownerUserId: null,
      createdAt: new Date().toISOString(),
    }).run();

    // Bob must still be blocked — his "owner" role in the second org must not count.
    const { GET: statsGet } = await import("@/app/api/stats/route");
    const res = await statsGet(new Request(`http://t/api/stats?id=${nullLinkId}`, {
      headers: { authorization: `Bearer ${rawKey}` },
    }));
    expect(res.status).toBe(403);
  });

  it("allowUserToCreateOrganization=false blocks org creation for members", async () => {
    const dbFile = process.env.SENTOU_DB!;
    const db = getDb(dbFile);
    migrate(db, { migrationsFolder: "lib/db/migrations" });

    const { bobCookie } = await setupWithSessions(db);

    // Bob (member) tries to create a new org — should be rejected.
    const { auth } = await import("@/lib/auth");
    const createOrgResp = await auth.api.createOrganization({
      body: { name: "Bob's Org", slug: "bobs-org" },
      headers: new Headers({
        host: "localhost:3000",
        cookie: `better-auth.session_token=${bobCookie}`,
      }),
      asResponse: true,
    }) as Response;
    // 403 Forbidden — allowUserToCreateOrganization: false.
    expect(createOrgResp.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: exposedDeploy checks both env vars independently
// ─────────────────────────────────────────────────────────────────────────────

describe("exposedDeploy superset check (fix 4)", () => {
  it("SENTOU_BASE_URL=localhost + public BETTER_AUTH_URL → exposed (old ?? operator masked this)", async () => {
    process.env.SENTOU_BASE_URL = "http://localhost:3000";
    process.env.BETTER_AUTH_URL = "https://sentou.example.com";
    const { exposedDeploy } = await import("@/lib/owner");
    expect(exposedDeploy()).toBe(true);
    delete process.env.SENTOU_BASE_URL;
    delete process.env.BETTER_AUTH_URL;
  });

  it("public SENTOU_BASE_URL + localhost BETTER_AUTH_URL → exposed", async () => {
    process.env.SENTOU_BASE_URL = "https://sentou.example.com";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    const { exposedDeploy } = await import("@/lib/owner");
    expect(exposedDeploy()).toBe(true);
    delete process.env.SENTOU_BASE_URL;
    delete process.env.BETTER_AUTH_URL;
  });

  it("both localhost → not exposed", async () => {
    process.env.SENTOU_BASE_URL = "http://localhost:3000";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3001";
    const { exposedDeploy } = await import("@/lib/owner");
    expect(exposedDeploy()).toBe(false);
    delete process.env.SENTOU_BASE_URL;
    delete process.env.BETTER_AUTH_URL;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5: API key revoke ownership enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe("API key revoke ownership enforcement (fix 5)", () => {
  it("owner can revoke their own key and the row becomes disabled", async () => {
    const { db, userA, keyA } = setupTwoActors();

    // Find Alice's key row ID
    const keyRow = db
      .select({ id: schema.apiKey.id })
      .from(schema.apiKey)
      .where(eq(schema.apiKey.userId, userA))
      .get();
    expect(keyRow).not.toBeNull();

    const { POST: revokePost } = await import("@/app/api/keys/revoke/route");
    const res = await revokePost(new Request("http://t/api/keys/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${keyA}`,
      },
      body: JSON.stringify({ id: keyRow!.id }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // Verify the key is actually disabled in the DB — not just a status code claim.
    const after = db
      .select({ enabled: schema.apiKey.enabled })
      .from(schema.apiKey)
      .where(eq(schema.apiKey.id, keyRow!.id))
      .get();
    expect(after?.enabled).toBe(false);
  });

  it("member cannot revoke owner's key — returns 404 and row stays enabled", async () => {
    const { db, userA, keyB } = setupTwoActors();

    // Find Alice's (owner's) key row ID
    const aliceKeyRow = db
      .select({ id: schema.apiKey.id })
      .from(schema.apiKey)
      .where(eq(schema.apiKey.userId, userA))
      .get();
    expect(aliceKeyRow).not.toBeNull();

    const { POST: revokePost } = await import("@/app/api/keys/revoke/route");
    const res = await revokePost(new Request("http://t/api/keys/revoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${keyB}`,
      },
      body: JSON.stringify({ id: aliceKeyRow!.id }),
    }));
    // 404 — we don't confirm existence of other users' keys
    expect(res.status).toBe(404);

    // Verify Alice's key is STILL enabled — the row must be unchanged.
    const still = db
      .select({ enabled: schema.apiKey.enabled })
      .from(schema.apiKey)
      .where(eq(schema.apiKey.id, aliceKeyRow!.id))
      .get();
    expect(still?.enabled).toBe(true);
  });

  it("unauthenticated request is rejected with 401", async () => {
    const { POST: revokePost } = await import("@/app/api/keys/revoke/route");
    const res = await revokePost(new Request("http://t/api/keys/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "any-id" }),
    }));
    expect(res.status).toBe(401);
  });
});
