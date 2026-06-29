import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink, getLinkBySlug } from "@/lib/links";
import { getStore } from "@/lib/server-store";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
});

const gated = (over = {}) => ({ requireEmail: true, allowedDomains: null as string[] | null, expiresAt: null as string | null, revoked: false, ...over });

describe("gate routes", () => {
  it("grants access for an allowed email, sets a cookie, records a viewer", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", gated());
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request("http://t/api/access", {
      method: "POST", body: JSON.stringify({ slug: link.slug, email: "a@x.com" }),
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(`sentou_${link.slug}=`);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    const after = await getLinkBySlug(getStore(), link.slug);
    expect(after!.viewers.map((v) => v.email)).toContain("a@x.com");
  });

  it("403s a blocked domain and sets no cookie", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", gated({ allowedDomains: ["acme.com"] }));
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request("http://t/api/access", {
      method: "POST", body: JSON.stringify({ slug: link.slug, email: "z@evil.com" }),
    }));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("400s when slug or email is missing", async () => {
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request("http://t/api/access", { method: "POST", body: JSON.stringify({ slug: "x" }) }));
    expect(res.status).toBe(400);
  });

  it("revokes a link", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", gated());
    const { POST } = await import("@/app/api/revoke/route");
    const res = await POST(new Request("http://t/api/revoke", { method: "POST", body: JSON.stringify({ id: link.id }) }));
    expect(res.status).toBe(200);
    const after = await getLinkBySlug(getStore(), link.slug);
    expect(after!.gate.revoked).toBe(true);
  });
});
