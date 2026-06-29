import { describe, it, expect, afterEach } from "vitest";
import { createMemoryStore } from "@/lib/store";
import { createLink, recordViewer } from "@/lib/links";

afterEach(() => { delete process.env.SENTOU_RETENTION_DAYS; });

describe("retention pruning", () => {
  it("drops viewers and events older than SENTOU_RETENTION_DAYS on the next write", async () => {
    process.env.SENTOU_RETENTION_DAYS = "30";
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>x</h1>", undefined, true);
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    link.viewers.push({ email: "old@x.com", at: old });
    link.events.push({ eventId: "old", linkId: link.id, viewer: "old@x.com", version: 1, openedAt: old, dwellMs: 0 });
    link.verifyAttempts = { "old@x.com": 3 };
    await store.put(link);
    await recordViewer(store, link.id, "new@x.com"); // a fresh write triggers the prune
    const after = (await store.get(link.id))!;
    expect(after.viewers.map((v) => v.email)).toEqual(["new@x.com"]);
    expect(after.events).toHaveLength(0);
    expect(after.verifyAttempts).toEqual({}); // emails don't linger here as keys past the window
  });

  it("keeps all data when SENTOU_RETENTION_DAYS is unset", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>x</h1>", undefined, true);
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    link.viewers.push({ email: "old@x.com", at: old });
    await store.put(link);
    await recordViewer(store, link.id, "new@x.com");
    const after = (await store.get(link.id))!;
    expect(after.viewers.map((v) => v.email).sort()).toEqual(["new@x.com", "old@x.com"]);
  });
});
