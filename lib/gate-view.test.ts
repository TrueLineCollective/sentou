import { describe, it, expect } from "vitest";
import { createMemoryStore } from "@/lib/store";
import { createLink } from "@/lib/links";
import { signAccessToken, verifyAccessToken } from "@/lib/token";
import { gateState } from "@/lib/gate-view";

describe("gateState", () => {
  it("open link -> open", async () => {
    const l = await createLink(createMemoryStore(), "<h1>x</h1>");
    expect(gateState(l, null)).toBe("open");
  });
  it("gated link without claim -> form", async () => {
    const l = await createLink(createMemoryStore(), "<h1>x</h1>", { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false });
    expect(gateState(l, null)).toBe("form");
  });
  it("gated link with a matching claim -> open", async () => {
    const l = await createLink(createMemoryStore(), "<h1>x</h1>", { requireEmail: true, allowedDomains: null, expiresAt: null, revoked: false });
    const claim = verifyAccessToken(signAccessToken({ linkId: l.id, email: "a@x.com" }));
    expect(gateState(l, claim)).toBe("open");
  });
  it("revoked -> denied", async () => {
    const l = await createLink(createMemoryStore(), "<h1>x</h1>", { requireEmail: false, allowedDomains: null, expiresAt: null, revoked: true });
    expect(gateState(l, null)).toBe("denied");
  });
});
