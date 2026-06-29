import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFileStore } from "@/lib/store";
import { createLink, republish, currentHtml } from "@/lib/links";

describe("file store", () => {
  it("persists links across separate store instances", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
    const a = createFileStore(file);
    const link = await createLink(a, "<h1>v1</h1>");
    await republish(a, link.id, "<h1>v2</h1>");

    const b = createFileStore(file); // fresh instance, same file
    const reloaded = await b.getBySlug(link.slug);
    expect(reloaded).not.toBeNull();
    expect(currentHtml(reloaded!)).toBe("<h1>v2</h1>");
  });
});
