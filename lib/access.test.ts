import { describe, it, expect } from "vitest";
import { createMemoryStore } from "@/lib/store";
import { createLink } from "@/lib/links";
import { evaluateAccess } from "@/lib/access";

const NOW = "2026-06-29T00:00:00.000Z";
async function link(gate?: Partial<import("@/lib/store").Gate>) {
  const store = createMemoryStore();
  return createLink(store, "<h1>x</h1>", {
    requireEmail: false, allowedDomains: null, expiresAt: null, revoked: false, ...gate,
  });
}

describe("evaluateAccess", () => {
  it("allows an open link with no email", async () => {
    expect(evaluateAccess(await link(), { now: NOW }).reason).toBe("ok");
  });
  it("denies a revoked link first, even if otherwise valid", async () => {
    const l = await link({ revoked: true, requireEmail: true });
    expect(evaluateAccess(l, { email: "a@x.com", now: NOW })).toEqual({ allowed: false, reason: "revoked" });
  });
  it("denies an expired link", async () => {
    const l = await link({ expiresAt: "2026-06-28T00:00:00.000Z" });
    expect(evaluateAccess(l, { now: NOW }).reason).toBe("expired");
  });
  it("requires an email when requireEmail", async () => {
    const l = await link({ requireEmail: true });
    expect(evaluateAccess(l, { now: NOW }).reason).toBe("email_required");
    expect(evaluateAccess(l, { email: "a@x.com", now: NOW }).reason).toBe("ok");
  });
  it("enforces the domain allowlist (case-insensitive)", async () => {
    const l = await link({ requireEmail: true, allowedDomains: ["acme.com"] });
    expect(evaluateAccess(l, { email: "z@ACME.com", now: NOW }).reason).toBe("ok");
    expect(evaluateAccess(l, { email: "z@evil.com", now: NOW }).reason).toBe("domain_blocked");
  });
  it("treats a domain allowlist as implying email is required", async () => {
    const l = await link({ requireEmail: false, allowedDomains: ["acme.com"] });
    expect(evaluateAccess(l, { now: NOW }).reason).toBe("email_required");
  });
  it("fails closed on an unparseable expiresAt (treats it as expired)", async () => {
    const l = await link({ expiresAt: "not-a-date" });
    expect(evaluateAccess(l, { now: NOW }).reason).toBe("expired");
  });
  it("blocks a smuggled second @ that would resolve to a non-allowed domain", async () => {
    const l = await link({ requireEmail: true, allowedDomains: ["acme.com"] });
    expect(evaluateAccess(l, { email: "a@acme.com@evil.com", now: NOW }).reason).toBe("domain_blocked");
  });
  it("blocks an address with no @ against an allowlist", async () => {
    const l = await link({ requireEmail: true, allowedDomains: ["acme.com"] });
    expect(evaluateAccess(l, { email: "noatsign", now: NOW }).reason).toBe("domain_blocked");
  });
});
