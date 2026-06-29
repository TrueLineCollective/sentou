import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => { process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json"); __resetRateLimits(); });
afterEach(() => { delete process.env.SENTOU_OWNER_TOKEN; vi.unstubAllEnvs(); });

describe("owner auth", () => {
  it("allows publish when no owner token is configured (default)", async () => {
    const { POST } = await import("@/app/api/publish/route");
    const res = await POST(new Request("http://t/api/publish", { method: "POST", body: JSON.stringify({ html: "<h1>x</h1>" }) }));
    expect(res.status).toBe(200);
  });
  it("401s publish without the bearer when an owner token IS configured", async () => {
    process.env.SENTOU_OWNER_TOKEN = "owner-secret";
    const { POST } = await import("@/app/api/publish/route");
    const res = await POST(new Request("http://t/api/publish", { method: "POST", body: JSON.stringify({ html: "<h1>x</h1>" }) }));
    expect(res.status).toBe(401);
  });
  it("allows publish with the correct bearer", async () => {
    process.env.SENTOU_OWNER_TOKEN = "owner-secret";
    const { POST } = await import("@/app/api/publish/route");
    const res = await POST(new Request("http://t/api/publish", { method: "POST", headers: { authorization: "Bearer owner-secret" }, body: JSON.stringify({ html: "<h1>x</h1>" }) }));
    expect(res.status).toBe(200);
  });
  it("fails closed in production when no owner token is configured (no silent open default)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SENTOU_OWNER_TOKEN;
    const { requireOwner } = await import("@/lib/owner");
    expect(() => requireOwner(new Request("http://t/api/publish"))).toThrow(/required in production/);
    // empty string must not disable auth either
    process.env.SENTOU_OWNER_TOKEN = "";
    expect(() => requireOwner(new Request("http://t/api/publish"))).toThrow(/required in production/);
  });
});
