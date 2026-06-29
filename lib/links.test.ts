import { describe, it, expect } from "vitest";
import { createMemoryStore } from "@/lib/store";
import { createLink, getLinkBySlug, republish, recordViewer, currentHtml } from "@/lib/links";

describe("links service", () => {
  it("creates a link with version 1 and a retrievable slug", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>v1</h1>");
    expect(link.slug).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(link.versions).toHaveLength(1);
    expect(currentHtml(link)).toBe("<h1>v1</h1>");
    const fetched = await getLinkBySlug(store, link.slug);
    expect(fetched?.id).toBe(link.id);
  });

  it("republishes new html to the same id/slug and bumps the version", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>v1</h1>");
    const updated = await republish(store, link.id, "<h1>v2</h1>");
    expect(updated.id).toBe(link.id);
    expect(updated.slug).toBe(link.slug);
    expect(updated.versions).toHaveLength(2);
    expect(currentHtml(updated)).toBe("<h1>v2</h1>");
  });

  it("throws when republishing an unknown id", async () => {
    const store = createMemoryStore();
    await expect(republish(store, "nope", "<p>x</p>")).rejects.toThrow("link not found");
  });

  it("preserves the gate and recorded viewers across a republish", async () => {
    const store = createMemoryStore();
    const link = await createLink(store, "<h1>v1</h1>", {
      requireEmail: true, allowedDomains: ["acme.com"], expiresAt: null, revoked: false,
    });
    await recordViewer(store, link.id, "a@acme.com");
    const updated = await republish(store, link.id, "<h1>v2</h1>");
    expect(updated.gate).toEqual({ requireEmail: true, allowedDomains: ["acme.com"], expiresAt: null, revoked: false });
    expect(updated.viewers.map((v) => v.email)).toEqual(["a@acme.com"]);
  });
});
