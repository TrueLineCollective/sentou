import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFileStore } from "@/lib/store";
import { createLink, revokeLink, recordClose, recordOpen } from "@/lib/links";

describe("mutation serialization", () => {
  it("a concurrent tracking write cannot clobber a revoke", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
    const store = createFileStore(file);
    const link = await createLink(store, "<h1>x</h1>", undefined, true);
    await recordOpen(store, { eventId: "e1", linkId: link.id, viewer: "a@x.com", version: 1, openedAt: "2026-06-29T00:00:00.000Z", dwellMs: 0 });
    await Promise.all([
      recordClose(store, link.id, "e1", 9000),
      revokeLink(store, link.id),
    ]);
    const after = await createFileStore(file).get(link.id);
    expect(after!.gate.revoked).toBe(true); // revoke must survive the concurrent close
    expect(after!.events[0].dwellMs).toBe(9000); // and the close must survive too
  });
});
