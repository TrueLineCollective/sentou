import { describe, it, expect } from "vitest";
import { createMemoryStore } from "@/lib/store";
import { createLink, recordOpen, recordClose } from "@/lib/links";
import { aggregate } from "@/lib/stats";

describe("tracking events + aggregate", () => {
  it("records opens and dwell, then aggregates per viewer", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>x</h1>", undefined, true);
    expect(link.track).toBe(true);
    expect(link.events).toEqual([]);

    await recordOpen(store, { eventId: "e1", linkId: link.id, viewer: "a@x.com", version: 1, openedAt: "2026-06-29T00:00:00.000Z", dwellMs: 0 });
    await recordClose(store, link.id, "e1", 5000);
    await recordOpen(store, { eventId: "e2", linkId: link.id, viewer: "a@x.com", version: 1, openedAt: "2026-06-29T00:01:00.000Z", dwellMs: 0 });
    await recordClose(store, link.id, "e2", 3000);
    await recordOpen(store, { eventId: "e3", linkId: link.id, viewer: "b@x.com", version: 1, openedAt: "2026-06-29T00:02:00.000Z", dwellMs: 0 });

    const reloaded = await store.get(link.id);
    const agg = aggregate(reloaded!.events);
    expect(agg.totalOpens).toBe(3);
    expect(agg.viewers).toHaveLength(2);
    const a = agg.viewers.find((v) => v.viewer === "a@x.com")!;
    expect(a.opens).toBe(2);
    expect(a.totalDwellMs).toBe(8000);
    expect(a.lastSeen).toBe("2026-06-29T00:01:00.000Z");
    const b = agg.viewers.find((v) => v.viewer === "b@x.com")!;
    expect(b.opens).toBe(1);
    expect(b.totalDwellMs).toBe(0);
  });

  it("defaults track off and stores no events", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>x</h1>");
    expect(link.track).toBe(false);
    expect(link.events).toEqual([]);
  });

  it("dedups a replayed open by eventId (one open delivered twice records once)", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>x</h1>", undefined, true);
    const e = { eventId: "dup", linkId: link.id, viewer: "a@x.com", version: 1, openedAt: "2026-06-29T00:00:00.000Z", dwellMs: 0 };
    await recordOpen(store, e);
    await recordOpen(store, { ...e });
    const reloaded = await store.get(link.id);
    expect(reloaded!.events).toHaveLength(1);
    expect(aggregate(reloaded!.events).totalOpens).toBe(1);
  });

  it("does not reset dwell when a duplicate open arrives after the close", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>x</h1>", undefined, true);
    const e = { eventId: "ev", linkId: link.id, viewer: "a@x.com", version: 1, openedAt: "2026-06-29T00:00:00.000Z", dwellMs: 0 };
    await recordOpen(store, e);
    await recordClose(store, link.id, "ev", 5000);
    await recordOpen(store, { ...e }); // late/retried open must not wipe the recorded dwell
    const reloaded = await store.get(link.id);
    expect(reloaded!.events).toHaveLength(1);
    expect(reloaded!.events[0].dwellMs).toBe(5000);
  });

  it("a later, smaller close does not shrink recorded dwell", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>x</h1>", undefined, true);
    await recordOpen(store, { eventId: "e1", linkId: link.id, viewer: "a@x.com", version: 1, openedAt: "2026-06-29T00:00:00.000Z", dwellMs: 0 });
    await recordClose(store, link.id, "e1", 5000);
    await recordClose(store, link.id, "e1", 1000);
    expect((await store.get(link.id))!.events[0].dwellMs).toBe(5000);
  });
});
