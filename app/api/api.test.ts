import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-")), "db.json");
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
});
