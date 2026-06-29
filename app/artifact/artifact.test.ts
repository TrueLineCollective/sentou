import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink, republish } from "@/lib/links";
import { getStore } from "@/lib/server-store";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
});

describe("artifact route", () => {
  it("serves current html with sandboxing headers", async () => {
    const link = await createLink(getStore(), "<h1>hello</h1>");
    const { GET } = await import("@/app/artifact/[slug]/route");
    const res = await GET(new Request("http://t/artifact/" + link.slug), {
      params: Promise.resolve({ slug: link.slug }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    // top-level-load bypass defense: the CSP must re-impose the sandbox even when the
    // artifact is opened directly at /artifact/:slug, outside the viewer iframe.
    expect(res.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(res.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    // nosniff stops the browser MIME-sniffing untrusted artifact HTML into another
    // type; no-store keeps user artifacts out of shared caches. Both are part of the
    // security spine, so a refactor that drops either must fail CI.
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).toBe("<h1>hello</h1>");
  });

  it("serves the latest version after republish", async () => {
    const link = await createLink(getStore(), "<h1>v1</h1>");
    await republish(getStore(), link.id, "<h1>v2</h1>");
    const { GET } = await import("@/app/artifact/[slug]/route");
    const res = await GET(new Request("http://t/artifact/" + link.slug), {
      params: Promise.resolve({ slug: link.slug }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>v2</h1>");
  });

  it("404s an unknown slug", async () => {
    const { GET } = await import("@/app/artifact/[slug]/route");
    const res = await GET(new Request("http://t/artifact/missing"), {
      params: Promise.resolve({ slug: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
