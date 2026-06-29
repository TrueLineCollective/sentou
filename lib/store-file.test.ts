import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFileStore } from "@/lib/store";
import { createLink, republish, recordViewer, currentHtml } from "@/lib/links";

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

  it("round-trips the gate and recorded viewers through a fresh store instance", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
    const a = createFileStore(file);
    const link = await createLink(a, "<h1>x</h1>", {
      requireEmail: true, allowedDomains: ["acme.com"], expiresAt: "2030-01-01T00:00:00.000Z", revoked: false,
    });
    await recordViewer(a, link.id, "a@acme.com");

    const b = createFileStore(file); // fresh instance, same file
    const reloaded = await b.getBySlug(link.slug);
    expect(reloaded!.gate).toEqual({ requireEmail: true, allowedDomains: ["acme.com"], expiresAt: "2030-01-01T00:00:00.000Z", revoked: false });
    expect(reloaded!.viewers.map((v) => v.email)).toEqual(["a@acme.com"]);
  });

  it("returns null rather than throwing when the db file is corrupt", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
    writeFileSync(file, "not json");
    const store = createFileStore(file);
    expect(await store.get("any-id")).toBeNull();
    expect(await store.getBySlug("any-slug")).toBeNull();
  });
});
