import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { makeAuth } from "@/lib/auth";
import { makeGetActor, resolveMembership } from "@/lib/auth-session";
import * as schema from "@/lib/db/schema";

// better-auth requires BETTER_AUTH_SECRET.
process.env.BETTER_AUTH_SECRET = "test-secret-sentou-dev-only-not-for-production";

function makeTestEnv() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-session-")), "t.db");
  const db = getDb(file);
  migrate(db, { migrationsFolder: "lib/db/migrations" });
  const auth = makeAuth(db);
  const getActor = makeGetActor(auth, db);
  return { auth, db, getActor };
}

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match ? match[1] : null;
}

describe("getActor", () => {
  let env: ReturnType<typeof makeTestEnv>;

  beforeEach(() => {
    env = makeTestEnv();
  });

  it("returns null for a request with no auth header", async () => {
    const actor = await env.getActor(new Request("http://t/api/publish"));
    expect(actor).toBeNull();
  });

  it("returns null for an invalid API key (key not in db)", async () => {
    const actor = await env.getActor(
      new Request("http://t/api/publish", {
        headers: { authorization: "Bearer invalid-key-not-in-db" },
      }),
    );
    expect(actor).toBeNull();
  });

  it("returns null for a malformed Authorization header (no 'Bearer ' prefix)", async () => {
    const actor = await env.getActor(
      new Request("http://t/api/publish", {
        headers: { authorization: "Token some-token" },
      }),
    );
    expect(actor).toBeNull();
  });

  it("returns actor with role=owner for a valid session cookie (first user)", async () => {
    // Sign up the first user; better-auth auto-creates the workspace org + owner membership.
    const signUpResp = await env.auth.api.signUpEmail({
      body: { name: "Alice", email: "alice@example.com", password: "hunter2-but-longer-than-8" },
      headers: new Headers({ host: "localhost:3000" }),
      asResponse: true,
    }) as Response;
    expect(signUpResp.status).toBe(200);

    const cookie = extractSessionCookie(signUpResp.headers.get("set-cookie"));
    expect(cookie).toBeTruthy();

    const actor = await env.getActor(
      new Request("http://t/api/stats", {
        headers: { cookie: `better-auth.session_token=${cookie}` },
      }),
    );
    expect(actor).not.toBeNull();
    expect(typeof actor?.userId).toBe("string");
    expect(actor?.role).toBe("owner"); // first user gets the owner role
  });

  it("returns actor for a valid API key", async () => {
    // Manually insert user, org, member, apiKey into the test DB to isolate
    // from the auth signup flow and test the key-lookup path directly.
    const orgId = randomUUID();
    env.db.insert(schema.organization).values({
      id: orgId, name: "Workspace", slug: "workspace", createdAt: new Date(),
    }).run();

    const userId = randomUUID();
    env.db.insert(schema.user).values({
      id: userId, name: "Alice", email: "alice@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    env.db.insert(schema.member).values({
      id: randomUUID(), organizationId: orgId, userId, role: "owner", createdAt: new Date(),
    }).run();

    const rawKey = "sentou_test_" + randomUUID().replace(/-/g, "");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    env.db.insert(schema.apiKey).values({
      id: randomUUID(), userId, name: "test key",
      keyHash, prefix: rawKey.slice(0, 8),
      createdAt: new Date(), enabled: true,
    }).run();

    const actor = await env.getActor(
      new Request("http://t/api/publish", {
        headers: { authorization: `Bearer ${rawKey}` },
      }),
    );
    expect(actor).not.toBeNull();
    expect(actor?.userId).toBe(userId);
    expect(actor?.role).toBe("owner");
  });

  it("returns null for an expired API key", async () => {
    const userId = randomUUID();
    env.db.insert(schema.user).values({
      id: userId, name: "Alice", email: "alice@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();

    const rawKey = "sentou_expired_" + randomUUID().replace(/-/g, "");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    // expiresAt is in the past
    const past = new Date(Date.now() - 60_000);
    env.db.insert(schema.apiKey).values({
      id: randomUUID(), userId, name: "expired key",
      keyHash, prefix: rawKey.slice(0, 8),
      createdAt: new Date(), expiresAt: past, enabled: true,
    }).run();

    const actor = await env.getActor(
      new Request("http://t/api/publish", {
        headers: { authorization: `Bearer ${rawKey}` },
      }),
    );
    expect(actor).toBeNull();
  });

  it("returns null for a disabled API key", async () => {
    const userId = randomUUID();
    env.db.insert(schema.user).values({
      id: userId, name: "Alice", email: "alice@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();

    const rawKey = "sentou_disabled_" + randomUUID().replace(/-/g, "");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    env.db.insert(schema.apiKey).values({
      id: randomUUID(), userId, name: "disabled key",
      keyHash, prefix: rawKey.slice(0, 8),
      createdAt: new Date(), enabled: false,
    }).run();

    const actor = await env.getActor(
      new Request("http://t/api/publish", {
        headers: { authorization: `Bearer ${rawKey}` },
      }),
    );
    expect(actor).toBeNull();
  });

  it("returns null for a valid API key whose user has no workspace membership", async () => {
    // A user + key with NO member row (e.g. an orphaned invite: signed up but
    // never accepted). The key is valid and enabled but must not authorize.
    env.db.insert(schema.organization).values({
      id: randomUUID(), name: "Workspace", slug: "workspace", createdAt: new Date(),
    }).run();
    const userId = randomUUID();
    env.db.insert(schema.user).values({
      id: userId, name: "Nomember", email: "nomember@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    const rawKey = "sentou_nomember_" + randomUUID().replace(/-/g, "");
    env.db.insert(schema.apiKey).values({
      id: randomUUID(), userId, name: "no-member key",
      keyHash: createHash("sha256").update(rawKey).digest("hex"),
      prefix: rawKey.slice(0, 8), createdAt: new Date(), enabled: true,
    }).run();

    const actor = await env.getActor(
      new Request("http://t/api/publish", {
        headers: { authorization: `Bearer ${rawKey}` },
      }),
    );
    expect(actor).toBeNull();
  });

  it("stops authorizing an API key once the member's row is removed", async () => {
    // Seed org + member + key, confirm the key authorizes, then delete the
    // member row (what removeMember does) and confirm the key no longer does.
    const orgId = randomUUID();
    env.db.insert(schema.organization).values({
      id: orgId, name: "Workspace", slug: "workspace", createdAt: new Date(),
    }).run();
    const userId = randomUUID();
    env.db.insert(schema.user).values({
      id: userId, name: "Bob", email: "bob@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    env.db.insert(schema.member).values({
      id: randomUUID(), organizationId: orgId, userId, role: "member", createdAt: new Date(),
    }).run();
    const rawKey = "sentou_removed_" + randomUUID().replace(/-/g, "");
    env.db.insert(schema.apiKey).values({
      id: randomUUID(), userId, name: "bob key",
      keyHash: createHash("sha256").update(rawKey).digest("hex"),
      prefix: rawKey.slice(0, 8), createdAt: new Date(), enabled: true,
    }).run();

    const request = () =>
      new Request("http://t/api/publish", { headers: { authorization: `Bearer ${rawKey}` } });

    const before = await env.getActor(request());
    expect(before?.role).toBe("member");

    env.db.delete(schema.member).where(eq(schema.member.userId, userId)).run();

    const after = await env.getActor(request());
    expect(after).toBeNull();
  });
});

describe("resolveMembership", () => {
  let env: ReturnType<typeof makeTestEnv>;
  beforeEach(() => {
    env = makeTestEnv();
  });

  it("returns null when the user has no member row in the workspace org", () => {
    env.db.insert(schema.organization).values({
      id: randomUUID(), name: "Workspace", slug: "workspace", createdAt: new Date(),
    }).run();
    const userId = randomUUID();
    env.db.insert(schema.user).values({
      id: userId, name: "Nobody", email: "nobody@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    expect(resolveMembership(env.db, userId)).toBeNull();
  });

  it("returns the role when the user is a member of the workspace org", () => {
    const orgId = randomUUID();
    env.db.insert(schema.organization).values({
      id: orgId, name: "Workspace", slug: "workspace", createdAt: new Date(),
    }).run();
    const userId = randomUUID();
    env.db.insert(schema.user).values({
      id: userId, name: "Owner", email: "owner@example.com",
      emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    }).run();
    env.db.insert(schema.member).values({
      id: randomUUID(), organizationId: orgId, userId, role: "owner", createdAt: new Date(),
    }).run();
    expect(resolveMembership(env.db, userId)).toBe("owner");
  });
});
