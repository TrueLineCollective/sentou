import { describe, it, expect } from "vitest";
import { newCode, sealVerify, openVerify } from "@/lib/verify";

describe("verify code", () => {
  it("newCode is six digits", () => { expect(newCode()).toMatch(/^\d{6}$/); });
  it("seals and opens, and the code is not readable in the token body", () => {
    const t = sealVerify({ slug: "s", email: "a@x.com", code: "424242", exp: Date.now() + 1000 });
    expect(Buffer.from(t.split(".")[0], "base64url").toString("utf8")).not.toContain("424242");
    expect(openVerify(t)).toMatchObject({ slug: "s", email: "a@x.com", code: "424242" });
  });
  it("rejects tampered/garbage tokens", () => {
    expect(openVerify("nope")).toBeNull();
    expect(openVerify(null)).toBeNull();
  });
});
