import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { makeAuth } from "@/lib/auth";

// better-auth requires BETTER_AUTH_SECRET.
process.env.BETTER_AUTH_SECRET = "test-secret-sentou-dev-only-not-for-production";

function makeTestAuth() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-auth-")), "t.db");
  const db = getDb(file);
  migrate(db, { migrationsFolder: "lib/db/migrations" });
  return makeAuth(db);
}

// Parse the session cookie value from a Set-Cookie header.
// better-auth signs cookies: "better-auth.session_token=<signed>; ..."
function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match ? match[1] : null;
}

describe("auth", () => {
  let testAuth: ReturnType<typeof makeTestAuth>;

  beforeEach(() => {
    testAuth = makeTestAuth();
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
});
