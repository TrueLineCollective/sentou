import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
  __resetRateLimits();
});

describe("api routes", () => {
  it("publishes then republishes to the same slug", async () => {
    const { POST: publish } = await import("@/app/api/publish/route");
    const { POST: republish } = await import("@/app/api/republish/route");

    const pub = await publish(new Request("http://t/api/publish", {
      method: "POST", body: JSON.stringify({ html: "<h1>v1</h1>" }),
    }));
    expect(pub.status).toBe(200);
    const created = await pub.json();
    expect(created.slug).toBeTruthy();
    expect(created.version).toBe(1);

    const rep = await republish(new Request("http://t/api/republish", {
      method: "POST", body: JSON.stringify({ id: created.id, html: "<h1>v2</h1>" }),
    }));
    expect(rep.status).toBe(200);
    const updated = await rep.json();
    expect(updated.slug).toBe(created.slug);
    expect(updated.version).toBe(2);
  });

  it("rejects publish with no html", async () => {
    const { POST: publish } = await import("@/app/api/publish/route");
    const res = await publish(new Request("http://t/api/publish", {
      method: "POST", body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it("404s republish for an unknown id", async () => {
    const { POST: republish } = await import("@/app/api/republish/route");
    const res = await republish(new Request("http://t/api/republish", {
      method: "POST", body: JSON.stringify({ id: "does-not-exist", html: "<p>x</p>" }),
    }));
    expect(res.status).toBe(404);
  });

  it("rejects republish with a missing id", async () => {
    const { POST: republish } = await import("@/app/api/republish/route");
    const res = await republish(new Request("http://t/api/republish", {
      method: "POST", body: JSON.stringify({ html: "<p>x</p>" }),
    }));
    expect(res.status).toBe(400);
  });

  it("stores gate config from publish params", async () => {
    const { POST: publish } = await import("@/app/api/publish/route");
    const { getLinkBySlug } = await import("@/lib/links");
    const { getStore } = await import("@/lib/server-store");
    const res = await publish(new Request("http://t/api/publish", {
      method: "POST",
      body: JSON.stringify({ html: "<h1>x</h1>", requireEmail: true, allowedDomains: ["acme.com"] }),
    }));
    const created = await res.json();
    const link = await getLinkBySlug(getStore(), created.slug);
    expect(link!.gate.requireEmail).toBe(true);
    expect(link!.gate.allowedDomains).toEqual(["acme.com"]);
  });

  it("sanitizes non-string allowedDomains instead of storing a gate that 500s on access", async () => {
    const { POST: publish } = await import("@/app/api/publish/route");
    const { getLinkBySlug } = await import("@/lib/links");
    const { getStore } = await import("@/lib/server-store");
    const res = await publish(new Request("http://t/api/publish", {
      method: "POST",
      body: JSON.stringify({ html: "<h1>x</h1>", requireEmail: true, allowedDomains: [123, "", "acme.com"] }),
    }));
    expect(res.status).toBe(200);
    const created = await res.json();
    const link = await getLinkBySlug(getStore(), created.slug);
    expect(link!.gate.allowedDomains).toEqual(["acme.com"]);
  });

  it("400s publish with a malformed expiresAt instead of silently never expiring", async () => {
    const { POST: publish } = await import("@/app/api/publish/route");
    const res = await publish(new Request("http://t/api/publish", {
      method: "POST",
      body: JSON.stringify({ html: "<h1>x</h1>", expiresAt: "not-a-real-date" }),
    }));
    expect(res.status).toBe(400);
  });

  it("stores the verifyEmail flag from publish", async () => {
    const { POST: publish } = await import("@/app/api/publish/route");
    const { getLinkBySlug } = await import("@/lib/links");
    const { getStore } = await import("@/lib/server-store");
    const res = await publish(new Request("http://t/api/publish", { method: "POST", body: JSON.stringify({ html: "<h1>x</h1>", requireEmail: true, verifyEmail: true }) }));
    const created = await res.json();
    expect((await getLinkBySlug(getStore(), created.slug))!.verifyEmail).toBe(true);
  });

  it("stores the track flag from publish params", async () => {
    const { POST: publish } = await import("@/app/api/publish/route");
    const { getLinkBySlug } = await import("@/lib/links");
    const { getStore } = await import("@/lib/server-store");
    const res = await publish(new Request("http://t/api/publish", {
      method: "POST", body: JSON.stringify({ html: "<h1>x</h1>", track: true }),
    }));
    const created = await res.json();
    expect((await getLinkBySlug(getStore(), created.slug))!.track).toBe(true);
  });

  it("preserves the track flag and recorded events across a republish", async () => {
    const { POST: publish } = await import("@/app/api/publish/route");
    const { POST: republish } = await import("@/app/api/republish/route");
    const { recordOpen, recordClose, getLinkBySlug } = await import("@/lib/links");
    const { getStore } = await import("@/lib/server-store");

    const pub = await publish(new Request("http://t/api/publish", {
      method: "POST", body: JSON.stringify({ html: "<h1>v1</h1>", track: true }),
    }));
    const created = await pub.json();
    await recordOpen(getStore(), { eventId: "e1", linkId: created.id, viewer: "a@x.com", version: 1, openedAt: new Date().toISOString(), dwellMs: 0 });
    await recordClose(getStore(), created.id, "e1", 3000);

    const rep = await republish(new Request("http://t/api/republish", {
      method: "POST", body: JSON.stringify({ id: created.id, html: "<h1>v2</h1>" }),
    }));
    expect(rep.status).toBe(200);

    const link = await getLinkBySlug(getStore(), created.slug);
    expect(link!.track).toBe(true);
    expect(link!.events).toHaveLength(1);
    expect(link!.events[0].dwellMs).toBe(3000);
    expect(link!.versions).toHaveLength(2);
  });
});
