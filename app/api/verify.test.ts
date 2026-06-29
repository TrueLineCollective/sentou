import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import path from "node:path";
import { createLink, getLinkBySlug, revokeLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { sealVerify } from "@/lib/verify";
import { verifyAccessToken } from "@/lib/token";
import { verifyCookieName, cookieName } from "@/lib/cookies";
import { __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => { process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json"); __resetRateLimits(); });

async function gated() {
  return createLink(getStore(), "<h1>secret</h1>", { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false }, false, true);
}
function withCode(slug: string, email: string, code: string, exp = Date.now() + 600_000) {
  return `${verifyCookieName(slug)}=${sealVerify({ slug, email, code, exp })}`;
}

describe("/api/access/verify", () => {
  it("grants a real, link-scoped access token, records the viewer, and clears the verify cookie", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    const res = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie: withCode(link.slug, "a@x.com", "111222") }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "111222" }) }));
    expect(res.status).toBe(200);
    // The minted access cookie must carry a real, verifiable, link-scoped token.
    const setCookies = res.headers.getSetCookie();
    const access = setCookies.find((c) => c.startsWith(`${cookieName(link.slug)}=`))!;
    const value = access.split(";")[0].split("=").slice(1).join("=");
    expect(verifyAccessToken(decodeURIComponent(value))).toEqual({ linkId: link.id, email: "a@x.com" });
    // Verify cookie is invalidated on success so the code can't be replayed within its TTL.
    const cleared = setCookies.find((c) => c.startsWith(`${verifyCookieName(link.slug)}=`))!;
    expect(cleared).toContain("Max-Age=0");
    // The verified email is recorded as a viewer exactly once.
    const after = await getLinkBySlug(getStore(), link.slug);
    expect(after!.viewers.map((v) => v.email)).toEqual(["a@x.com"]);
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

  it("rejects a wrong code and an expired code", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    const wrong = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie: withCode(link.slug, "a@x.com", "111222") }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "000000" }) }));
    expect(wrong.status).toBe(401);
    const expired = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie: withCode(link.slug, "a@x.com", "111222", Date.now() - 1) }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "111222" }) }));
    expect(expired.status).toBe(401);
  });

  it("rejects a cross-email code: a code minted for a@x.com cannot grant access as b@x.com", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    // claim.email === email is the SOLE guard here (the verify cookie is slug-scoped, not
    // email-scoped), so present a@x.com's valid code under a request claiming b@x.com.
    const res = await POST(new Request("http://t/api/access/verify", {
      method: "POST",
      headers: { cookie: withCode(link.slug, "a@x.com", "111222") },
      body: JSON.stringify({ slug: link.slug, email: "b@x.com", code: "111222" }),
    }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a cross-slug code: a claim sealed for another slug cannot grant access here", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    // Place a token whose CLAIM slug differs under THIS slug's cookie name, so the route
    // reads it (cookie name matches) but claim.slug !== submitted slug -> claim.slug===slug fails.
    const cookie = `${verifyCookieName(link.slug)}=${sealVerify({ slug: "some-other-slug", email: "a@x.com", code: "111222", exp: Date.now() + 600_000 })}`;
    const res = await POST(new Request("http://t/api/access/verify", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "111222" }),
    }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("re-checks access at redemption: a link revoked after the code was sent yields 403, no access cookie", async () => {
    const link = await gated();
    await revokeLink(getStore(), link.id);
    const { POST } = await import("@/app/api/access/verify/route");
    const res = await POST(new Request("http://t/api/access/verify", {
      method: "POST",
      headers: { cookie: withCode(link.slug, "a@x.com", "111222") },
      body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "111222" }),
    }));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a no-cookie attacker who knows {slug,email} cannot burn the recipient's attempt budget", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    // 10 code POSTs with NO verify cookie: each is rejected without spending an attempt.
    for (let i = 0; i < 10; i++) {
      const r = await POST(new Request("http://t/api/access/verify", { method: "POST", body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "000000" }) }));
      expect(r.status).toBe(401);
    }
    // The legitimate recipient, holding a real verify cookie, still has the full budget intact:
    // their correct code is accepted (it would be 429-locked if the attacker had burned it).
    const ok = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie: withCode(link.slug, "a@x.com", "111222") }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "111222" }) }));
    expect(ok.status).toBe(200);
  });

  it("locks the code after 5 attempts, so the 6th is refused even when correct (brute-force cap)", async () => {
    const link = await gated();
    const { POST } = await import("@/app/api/access/verify/route");
    const cookie = withCode(link.slug, "a@x.com", "111222");
    for (let i = 0; i < 5; i++) {
      const wrong = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "000000" }) }));
      expect(wrong.status).toBe(401);
    }
    const locked = await POST(new Request("http://t/api/access/verify", { method: "POST", headers: { cookie }, body: JSON.stringify({ slug: link.slug, email: "a@x.com", code: "111222" }) }));
    expect(locked.status).toBe(429);
  });
});
