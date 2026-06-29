import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink } from "@/lib/links";
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
    expect(await res.text()).toBe("<h1>hello</h1>");
  });

  it("404s an unknown slug", async () => {
    const { GET } = await import("@/app/artifact/[slug]/route");
    const res = await GET(new Request("http://t/artifact/missing"), {
      params: Promise.resolve({ slug: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
