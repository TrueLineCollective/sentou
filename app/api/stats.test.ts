import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink, recordOpen, recordClose } from "@/lib/links";
import { getStore } from "@/lib/server-store";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
});

describe("/api/stats", () => {
  it("returns per-viewer aggregates", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    await recordOpen(getStore(), { eventId: "e1", linkId: link.id, viewer: "a@x.com", version: 1, openedAt: "2026-06-29T00:00:00.000Z", dwellMs: 0 });
    await recordClose(getStore(), link.id, "e1", 7000);
    const { GET } = await import("@/app/api/stats/route");
    const res = await GET(new Request("http://t/api/stats?id=" + link.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalOpens).toBe(1);
    expect(body.viewers[0]).toMatchObject({ viewer: "a@x.com", opens: 1, totalDwellMs: 7000 });
  });
  it("404s an unknown id and 400s a missing id", async () => {
    const { GET } = await import("@/app/api/stats/route");
    expect((await GET(new Request("http://t/api/stats?id=nope"))).status).toBe(404);
    expect((await GET(new Request("http://t/api/stats"))).status).toBe(400);
  });
});
