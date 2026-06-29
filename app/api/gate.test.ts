import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLink, getLinkBySlug } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { verifyAccessToken } from "@/lib/token";
import { __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
  __resetRateLimits();
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
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain(`sentou_${link.slug}=`);
    expect(setCookie).toContain("HttpOnly");
    // SameSite=Lax is the CSRF-relevant attribute; Path=/ scopes the cookie.
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    // The emitted cookie value must be a real, verifiable, link-scoped token.
    const value = setCookie.split(";")[0].split("=").slice(1).join("=");
    expect(verifyAccessToken(decodeURIComponent(value))).toEqual({ linkId: link.id, email: "a@x.com" });
    const after = await getLinkBySlug(getStore(), link.slug);
    expect(after!.viewers.map((v) => v.email)).toContain("a@x.com");
  });

  it("accepts the native urlencoded form and 303-redirects back to the viewer", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", gated());
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request(`http://t/api/access?slug=${link.slug}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `email=a%40x.com&slug=${link.slug}`,
    }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/v/${link.slug}`);
    expect(res.headers.get("set-cookie")).toContain(`sentou_${link.slug}=`);
  });

  it("a cookie minted by /api/access unlocks the gated artifact end-to-end", async () => {
    const link = await createLink(getStore(), "<h1>secret</h1>", gated());
    const { POST } = await import("@/app/api/access/route");
    const accessRes = await POST(new Request("http://t/api/access", {
      method: "POST", body: JSON.stringify({ slug: link.slug, email: "a@x.com" }),
    }));
    const cookiePair = accessRes.headers.get("set-cookie")!.split(";")[0]; // sentou_<slug>=<token>
    const { GET } = await import("@/app/artifact/[slug]/route");
    const res = await GET(new Request("http://t/artifact/" + link.slug, { headers: { cookie: cookiePair } }), {
      params: Promise.resolve({ slug: link.slug }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>secret</h1>");
  });

  it("sends a code and withholds access when verifyEmail is on", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false }, false, true);
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request("http://t/api/access", { method: "POST", body: JSON.stringify({ slug: link.slug, email: "a@x.com" }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "code_sent" });
    const sc = res.headers.get("set-cookie") || "";
    expect(sc).toContain(`sentou_verify_${link.slug}=`);
    expect(sc).not.toContain(`sentou_${link.slug}=`); // no access cookie yet
  });

  it("on a form submit with verifyEmail, 303s to the code step carrying the verify cookie", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false }, false, true);
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request(`http://t/api/access?slug=${link.slug}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `email=a%40x.com&slug=${link.slug}`,
    }));
    expect(res.status).toBe(303);
    // The email is NOT in the redirect URL (it would land in proxy logs / browser history); it
    // rides in the sealed verify cookie and the viewer reads it back from there.
    expect(res.headers.get("location")).toBe(`/v/${link.slug}?step=code`);
    const sc = res.headers.get("set-cookie") || "";
    expect(sc).toContain(`sentou_verify_${link.slug}=`);
    expect(sc).not.toContain(`sentou_${link.slug}=`); // still no access cookie
  });

  it("403s a blocked domain on a verifyEmail+allowlist link BEFORE emailing a code", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", { requireEmail: true, allowedDomains: ["acme.com"], expiresAt: null, revoked: false }, false, true);
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request("http://t/api/access", { method: "POST", body: JSON.stringify({ slug: link.slug, email: "z@evil.com" }) }));
    expect(res.status).toBe(403);
    // No code is sent and no cookie of any kind (verify or access) is issued to a blocked domain.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a verifyEmail link cannot resolve to an OPEN gate even with requireEmail off and no allowlist", async () => {
    // The operator flips on verifyEmail but leaves require-email off: createLink must still
    // force the email gate, or the artifact would serve unverified content.
    const link = await createLink(getStore(), "<h1>secret</h1>", { requireEmail: false, allowedDomains: null, expiresAt: null, revoked: false }, false, true);
    expect(link.gate.requireEmail).toBe(true);
    const { GET } = await import("@/app/artifact/[slug]/route");
    const res = await GET(new Request("http://t/artifact/" + link.slug), { params: Promise.resolve({ slug: link.slug }) });
    expect(res.status).toBe(403); // email_required, content withheld
  });

  it("404s /api/access for an unknown slug", async () => {
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request("http://t/api/access", {
      method: "POST", body: JSON.stringify({ slug: "does-not-exist", email: "a@x.com" }),
    }));
    expect(res.status).toBe(404);
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

  it("400s a malformed email at the boundary instead of storing garbage", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", gated());
    const { POST } = await import("@/app/api/access/route");
    const res = await POST(new Request("http://t/api/access", { method: "POST", body: JSON.stringify({ slug: link.slug, email: "not-an-email" }) }));
    expect(res.status).toBe(400);
    expect((await getLinkBySlug(getStore(), link.slug))!.viewers).toHaveLength(0);
  });

  it("revokes a link", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", gated());
    const { POST } = await import("@/app/api/revoke/route");
    const res = await POST(new Request("http://t/api/revoke", { method: "POST", body: JSON.stringify({ id: link.id }) }));
    expect(res.status).toBe(200);
    const after = await getLinkBySlug(getStore(), link.slug);
    expect(after!.gate.revoked).toBe(true);
  });

  it("400s /api/revoke with a missing id and 404s an unknown id", async () => {
    const { POST } = await import("@/app/api/revoke/route");
    const missing = await POST(new Request("http://t/api/revoke", { method: "POST", body: JSON.stringify({}) }));
    expect(missing.status).toBe(400);
    const unknown = await POST(new Request("http://t/api/revoke", { method: "POST", body: JSON.stringify({ id: "nope" }) }));
    expect(unknown.status).toBe(404);
  });

  it("dedupes a repeat viewer email instead of growing the array", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false });
    const { POST } = await import("@/app/api/access/route");
    for (let i = 0; i < 3; i++) {
      await POST(new Request("http://t/api/access", { method: "POST", body: JSON.stringify({ slug: link.slug, email: "a@x.com" }) }));
    }
    const after = await getLinkBySlug(getStore(), link.slug);
    expect(after!.viewers.filter((v) => v.email === "a@x.com")).toHaveLength(1);
  });
});
