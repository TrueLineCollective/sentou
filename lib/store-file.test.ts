import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
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

  it("throws (and preserves the file) instead of silently emptying the store when the db is corrupt", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
    writeFileSync(file, "not json");
    const store = createFileStore(file);
    await expect(store.get("any-id")).rejects.toThrow(/not valid JSON/i);
    await expect(store.getBySlug("any-slug")).rejects.toThrow(/not valid JSON/i);
    // the corrupt bytes are left on disk for recovery, never overwritten with an empty store
    expect(readFileSync(file, "utf8")).toBe("not json");
  });

  it("normalizes a record written by an older Sentou that lacks the newer fields", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
    const legacy = {
      id: "id1", slug: "slug1", createdAt: "2025-01-01T00:00:00.000Z",
      versions: [{ version: 1, html: "<h1>legacy</h1>", createdAt: "2025-01-01T00:00:00.000Z" }],
      gate: { requireEmail: false, allowedDomains: null, expiresAt: null, revoked: false },
    };
    writeFileSync(file, JSON.stringify({ id1: legacy }));
    const link = (await createFileStore(file).getBySlug("slug1"))!;
    expect(link).not.toBeNull();
    expect(link.events).toEqual([]);
    expect(link.viewers).toEqual([]);
    expect(link.track).toBe(false);
    expect(link.verifyEmail).toBe(false);
    expect(link.verifyAttempts).toEqual({});
  });
});
