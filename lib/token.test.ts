import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken } from "@/lib/token";

describe("access token", () => {
  it("round-trips a valid token, defaulting verified to false", () => {
    const t = signAccessToken({ linkId: "L1", email: "a@x.com" });
    expect(verifyAccessToken(t)).toEqual({ linkId: "L1", email: "a@x.com", verified: false });
  });
  it("carries the verified flag when the email was proven", () => {
    const t = signAccessToken({ linkId: "L1", email: "a@x.com", verified: true });
    expect(verifyAccessToken(t)).toEqual({ linkId: "L1", email: "a@x.com", verified: true });
  });
  it("expires the access session (rejects a token past its TTL)", () => {
    const t = signAccessToken({ linkId: "L1", email: "a@x.com" });
    expect(verifyAccessToken(t)).not.toBeNull(); // valid now
    expect(verifyAccessToken(t, Date.now() + 8 * 24 * 3600_000)).toBeNull(); // 8 days out, past the 7-day TTL
  });
  it("rejects a tampered payload (signature mismatch)", () => {
    const t = signAccessToken({ linkId: "L1", email: "a@x.com" });
    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ linkId: "L1", email: "attacker@x.com" })).toString("base64url");
    expect(verifyAccessToken(forged + "." + sig)).toBeNull();
  });
  it("rejects malformed / empty tokens", () => {
    expect(verifyAccessToken(null)).toBeNull();
    expect(verifyAccessToken("")).toBeNull();
    expect(verifyAccessToken("nodot")).toBeNull();
  });
  it("a token still carries its own linkId for the caller to scope-check", () => {
    const t = signAccessToken({ linkId: "A", email: "a@x.com" });
    expect(verifyAccessToken(t)!.linkId).toBe("A"); // caller must compare to the link being served
  });
  it("does NOT leak the payload to a client (encrypted body, no plaintext linkId)", () => {
    const t = signAccessToken({ linkId: "secret-link-id", email: "a@x.com" });
    const body = t.split(".")[0];
    const decoded = Buffer.from(body, "base64url").toString("utf8");
    expect(decoded).not.toContain("secret-link-id");
    expect(decoded).not.toContain("linkId");
    expect(verifyAccessToken(t)).toEqual({ linkId: "secret-link-id", email: "a@x.com", verified: false });
  });
  it("rejects a token signed under a different secret (signature binds to the key)", () => {
    process.env.SENTOU_SECRET = "key-A";
    const t = signAccessToken({ linkId: "L", email: "a@x.com" });
    process.env.SENTOU_SECRET = "key-B";
    expect(verifyAccessToken(t)).toBeNull();
    delete process.env.SENTOU_SECRET;
  });
});
