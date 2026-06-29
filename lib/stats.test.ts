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
    const a = agg.viewers.find((v) => v.viewer === "a@x.com")!;
    expect(a.opens).toBe(2);
    expect(a.totalDwellMs).toBe(8000);
    expect(a.lastSeen).toBe("2026-06-29T00:01:00.000Z");
  });

  it("defaults track off and stores no events", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>x</h1>");
    expect(link.track).toBe(false);
    expect(link.events).toEqual([]);
  });
});
