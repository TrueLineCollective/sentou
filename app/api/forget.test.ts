import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink, recordViewer, recordOpen, getLinkBySlug } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "t.db");
  __resetRateLimits();
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function tracked() {
  const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
  await recordViewer(getStore(), link.id, "a@x.com");
  await recordViewer(getStore(), link.id, "b@x.com");
  await recordOpen(getStore(), { eventId: "e1", linkId: link.id, viewer: "a@x.com", version: 1, openedAt: new Date().toISOString(), dwellMs: 0 });
  await recordOpen(getStore(), { eventId: "e2", linkId: link.id, viewer: "b@x.com", version: 1, openedAt: new Date().toISOString(), dwellMs: 0 });
  return link;
}

describe("/api/forget", () => {
  it("purges all recipient data for a link but keeps the artifact", async () => {
    const link = await tracked();
    const { POST } = await import("@/app/api/forget/route");
    const res = await POST(new Request("http://t/api/forget", { method: "POST", body: JSON.stringify({ id: link.id }) }));
    expect(res.status).toBe(200);
    const after = await getLinkBySlug(getStore(), link.slug);
    expect(after!.viewers).toHaveLength(0);
    expect(after!.events).toHaveLength(0);
    expect(after!.versions).toHaveLength(1); // the document survives
  });

  it("erases a single subject's row and their events, leaving others intact", async () => {
    const link = await tracked();
    const { POST } = await import("@/app/api/forget/route");
    const res = await POST(new Request("http://t/api/forget", { method: "POST", body: JSON.stringify({ id: link.id, email: "a@x.com" }) }));
    expect(res.status).toBe(200);
    const after = await getLinkBySlug(getStore(), link.slug);
    expect(after!.viewers.map((v) => v.email)).toEqual(["b@x.com"]);
    expect(after!.events.map((e) => e.viewer)).toEqual(["b@x.com"]);
  });

  it("400s a missing id and 404s an unknown id", async () => {
    const { POST } = await import("@/app/api/forget/route");
    expect((await POST(new Request("http://t/api/forget", { method: "POST", body: JSON.stringify({}) }))).status).toBe(400);
    expect((await POST(new Request("http://t/api/forget", { method: "POST", body: JSON.stringify({ id: "nope" }) }))).status).toBe(404);
  });

  it("401s in production when no actor is present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const link = await tracked();
    const { POST } = await import("@/app/api/forget/route");
    const res = await POST(new Request("http://t/api/forget", { method: "POST", body: JSON.stringify({ id: link.id }) }));
    expect(res.status).toBe(401);
  });
});
