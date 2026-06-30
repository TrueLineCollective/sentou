import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { makeAuth } from "@/lib/auth";
import * as schema from "@/lib/db/schema";

// better-auth requires BETTER_AUTH_SECRET.
process.env.BETTER_AUTH_SECRET = "test-secret-sentou-dev-only-not-for-production";

function makeTestAuth() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-auth-")), "t.db");
  const db = getDb(file);
  migrate(db, { migrationsFolder: "lib/db/migrations" });
  return { auth: makeAuth(db), db };
}

// Parse the session cookie value from a Set-Cookie header.
// better-auth signs cookies: "better-auth.session_token=<signed>; ..."
function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match ? match[1] : null;
}

describe("auth", () => {
  let testAuth: ReturnType<typeof makeTestAuth>["auth"];
  let testDb: ReturnType<typeof makeTestAuth>["db"];

  beforeEach(() => {
    ({ auth: testAuth, db: testDb } = makeTestAuth());
  });

  it("signs up a user and getSession returns that user", async () => {
    // Use asResponse to get the signed session cookie from Set-Cookie.
    const signUpResp: Response = await testAuth.api.signUpEmail({
      body: {
        name: "Alice",
        email: "alice@example.com",
        password: "hunter2-but-longer-than-8",
      },
      headers: new Headers({ host: "localhost:3000" }),
      asResponse: true,
    });

    expect(signUpResp.status).toBe(200);

    // Extract the signed session cookie value from the Set-Cookie header.
    const signedCookie = extractSessionCookie(signUpResp.headers.get("set-cookie"));
    expect(signedCookie).toBeTruthy();

    // Call getSession with the signed cookie to verify the session.
    const sessionResult = await testAuth.api.getSession({
      headers: new Headers({
        host: "localhost:3000",
        cookie: `better-auth.session_token=${signedCookie}`,
      }),
    });

    expect(sessionResult).not.toBeNull();
    const result = sessionResult as { user?: { email: string } } | null;
    expect(result?.user?.email).toBe("alice@example.com");
  });

  it("getSession returns null for an unauthenticated request", async () => {
    const result = await testAuth.api.getSession({
      headers: new Headers({ host: "localhost:3000" }),
    });
    expect(result).toBeNull();
  });

  it("first-owner signup auto-creates workspace org with user as owner", async () => {
    const signUpResp: Response = await testAuth.api.signUpEmail({
      body: {
        name: "Alice",
        email: "alice@example.com",
        password: "hunter2-but-longer-than-8",
      },
      headers: new Headers({ host: "localhost:3000" }),
      asResponse: true,
    });
    expect(signUpResp.status).toBe(200);

    const users = await testDb.select().from(schema.user).limit(1);
    expect(users.length).toBe(1);

    const orgs = await testDb.select().from(schema.organization);
    expect(orgs.length).toBe(1);
    expect(orgs[0].slug).toBe("workspace");

    const members = await testDb.select().from(schema.member);
    expect(members.length).toBe(1);
    expect(members[0].userId).toBe(users[0].id);
    expect(members[0].role).toBe("owner");
    expect(members[0].organizationId).toBe(orgs[0].id);
  });

  it("second signup without an invitation is rejected with FORBIDDEN", async () => {
    // Alice signs up first (owner bootstrap).
    const aliceResp: Response = await testAuth.api.signUpEmail({
      body: {
        name: "Alice",
        email: "alice@example.com",
        password: "hunter2-but-longer-than-8",
      },
      headers: new Headers({ host: "localhost:3000" }),
      asResponse: true,
    });
    expect(aliceResp.status).toBe(200);

    // Bob has no invite — must be rejected.
    const bobResp: Response = await testAuth.api.signUpEmail({
      body: {
        name: "Bob",
        email: "bob@example.com",
        password: "hunter2-but-longer-than-8",
      },
      headers: new Headers({ host: "localhost:3000" }),
      asResponse: true,
    });
    expect(bobResp.status).toBe(403);
  });

  it("createInvitation works and invited email can sign up", async () => {
    // Step 1: Alice signs up (first owner).
    const aliceSignUp: Response = await testAuth.api.signUpEmail({
      body: {
        name: "Alice",
        email: "alice@example.com",
        password: "hunter2-but-longer-than-8",
      },
      headers: new Headers({ host: "localhost:3000" }),
      asResponse: true,
    });
    expect(aliceSignUp.status).toBe(200);
    const aliceCookie = extractSessionCookie(aliceSignUp.headers.get("set-cookie"));
    expect(aliceCookie).toBeTruthy();

    // Step 2: Get the bootstrapped org ID from the DB.
    const orgs = await testDb.select().from(schema.organization).limit(1);
    expect(orgs.length).toBe(1);
    const orgId = orgs[0].id;

    // Step 3: Alice invites Bob.
    const inviteResp: Response = await testAuth.api.createInvitation({
      body: { email: "bob@example.com", role: "member", organizationId: orgId },
      headers: new Headers({
        host: "localhost:3000",
        cookie: `better-auth.session_token=${aliceCookie}`,
      }),
      asResponse: true,
    });
    expect(inviteResp.status).toBe(200);

    // Step 4: Invitation row must exist in DB.
    const invites = await testDb.select().from(schema.invitation);
    expect(invites.length).toBe(1);
    expect(invites[0].email).toBe("bob@example.com");
    expect(invites[0].status).toBe("pending");
    expect(invites[0].organizationId).toBe(orgId);

    // Step 5: Bob signs up with his invited email — must succeed.
    const bobResp: Response = await testAuth.api.signUpEmail({
      body: {
        name: "Bob",
        email: "bob@example.com",
        password: "hunter2-but-longer-than-8",
      },
      headers: new Headers({ host: "localhost:3000" }),
      asResponse: true,
    });
    expect(bobResp.status).toBe(200);
  });
});
