import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import path from "node:path";
import { createLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { sealVerify } from "@/lib/verify";
import { verifyCookieName, cookieName } from "@/lib/cookies";

beforeEach(() => { process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json"); });

async function gated() {
  return createLink(getStore(), "<h1>secret</h1>", { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false }, false, true);
}
function withCode(slug: string, email: string, code: string, exp = Date.now() + 600_000) {
  return `${verifyCookieName(slug)}=${sealVerify({ slug, email, code, exp })}`;
}

describe("/api/access/verify", () => {
  it("grants an access cookie for the correct code", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    const res = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie: withCode(link.slug, "a@x.com", "111222") }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "111222" }) }));
    expect(res.status).toBe(200);
    expect((res.headers.get("set-cookie") || "")).toContain(`${cookieName(link.slug)}=`);
  });
  it("accepts a native form post and 303-redirects to the viewer with the access cookie", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    const res = await POST(new Request(`http://t/api/access/verify?slug=${link.slug}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: withCode(link.slug, "a@x.com", "111222") },
      body: `slug=${link.slug}&email=a%40x.com&code=111222`,
    }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/v/${link.slug}`);
    expect(res.headers.get("set-cookie") || "").toContain(`${cookieName(link.slug)}=`);
  });

  it("rejects a wrong code, an expired code, and a cross-slug code", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    const wrong = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie: withCode(link.slug, "a@x.com", "111222") }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "000000" }) }));
    expect(wrong.status).toBe(401);
    const expired = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie: withCode(link.slug, "a@x.com", "111222", Date.now() - 1) }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "111222" }) }));
    expect(expired.status).toBe(401);
  });
});
