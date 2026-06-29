import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { signTrackToken } from "@/lib/track-token";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
});

describe("/api/track", () => {
  it("records an open then a close with dwell", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const token = signTrackToken({ linkId: link.id, version: 1, viewer: "a@x.com", eventId: "ev1" });
    const { POST } = await import("@/app/api/track/route");

    const open = await POST(new Request("http://t/api/track", { method: "POST", body: JSON.stringify({ token, type: "open" }) }));
    expect(open.status).toBe(204);
    const close = await POST(new Request("http://t/api/track", { method: "POST", body: JSON.stringify({ token, type: "close", dwellMs: 4200 }) }));
    expect(close.status).toBe(204);

    const { getLinkBySlug } = await import("@/lib/links");
    const reloaded = await getLinkBySlug(getStore(), link.slug);
    expect(reloaded!.events).toHaveLength(1);
    expect(reloaded!.events[0].viewer).toBe("a@x.com");
    expect(reloaded!.events[0].dwellMs).toBe(4200);
  });

  it("ignores a forged token (records nothing, still 204)", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const { POST } = await import("@/app/api/track/route");
    const res = await POST(new Request("http://t/api/track", { method: "POST", body: JSON.stringify({ token: "forged.sig", type: "open" }) }));
    expect(res.status).toBe(204);
    const { getLinkBySlug } = await import("@/lib/links");
    expect((await getLinkBySlug(getStore(), link.slug))!.events).toHaveLength(0);
  });

  it("400s an unparseable body", async () => {
    const { POST } = await import("@/app/api/track/route");
    const res = await POST(new Request("http://t/api/track", { method: "POST", body: "%%%not-json%%%", headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(400);
  });

  it("clamps a negative or non-numeric dwellMs to 0", async () => {
    const { POST } = await import("@/app/api/track/route");
    const { recordOpen, getLinkBySlug } = await import("@/lib/links");
    for (const [eventId, bad] of [["neg", -5], ["nan", "abc"]] as const) {
      const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
      await recordOpen(getStore(), { eventId, linkId: link.id, viewer: "a@x.com", version: 1, openedAt: new Date().toISOString(), dwellMs: 0 });
      const token = signTrackToken({ linkId: link.id, version: 1, viewer: "a@x.com", eventId });
      const res = await POST(new Request("http://t/api/track", { method: "POST", body: JSON.stringify({ token, type: "close", dwellMs: bad }) }));
      expect(res.status).toBe(204);
      const reloaded = await getLinkBySlug(getStore(), link.slug);
      expect(reloaded!.events[0].dwellMs).toBe(0);
    }
  });

  it("204s and records nothing for an unknown event type", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const token = signTrackToken({ linkId: link.id, version: 1, viewer: "a@x.com", eventId: "ev" });
    const { POST } = await import("@/app/api/track/route");
    const res = await POST(new Request("http://t/api/track", { method: "POST", body: JSON.stringify({ token, type: "weird" }) }));
    expect(res.status).toBe(204);
    const { getLinkBySlug } = await import("@/lib/links");
    expect((await getLinkBySlug(getStore(), link.slug))!.events).toHaveLength(0);
  });

  it("204s and records nothing for a close before any open", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const token = signTrackToken({ linkId: link.id, version: 1, viewer: "a@x.com", eventId: "ghost" });
    const { POST } = await import("@/app/api/track/route");
    const res = await POST(new Request("http://t/api/track", { method: "POST", body: JSON.stringify({ token, type: "close", dwellMs: 1000 }) }));
    expect(res.status).toBe(204);
    const { getLinkBySlug } = await import("@/lib/links");
    expect((await getLinkBySlug(getStore(), link.slug))!.events).toHaveLength(0);
  });

  it("does not lose an open when two beacons race (serialized file-store write path)", async () => {
    // The file store does get -> mutate -> put; without serialization two concurrent
    // recordOpen calls read the same on-disk state and the second put clobbers the first.
    // Must use the FILE store (getStore), not the memory store, whose get returns a shared
    // object reference and so would pass even when the write path is unsafe.
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const { recordOpen, getLinkBySlug } = await import("@/lib/links");
    const mk = (eventId: string) => ({ eventId, linkId: link.id, viewer: "a@x.com", version: 1, openedAt: new Date().toISOString(), dwellMs: 0 });
    await Promise.all([recordOpen(getStore(), mk("A")), recordOpen(getStore(), mk("B"))]);
    const reloaded = await getLinkBySlug(getStore(), link.slug);
    expect(reloaded!.events).toHaveLength(2);
    expect(reloaded!.events.map((e) => e.eventId).sort()).toEqual(["A", "B"]);
  });
});
