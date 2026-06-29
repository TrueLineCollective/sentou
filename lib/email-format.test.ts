import { describe, it, expect } from "vitest";
import { cleanEmail } from "@/lib/email-format";

describe("cleanEmail", () => {
  it("accepts a well-formed address and trims surrounding whitespace", () => {
    expect(cleanEmail("  a@x.com ")).toBe("a@x.com");
  });
  it("lowercases so case variants collapse to one rate-limit / dedup key", () => {
    expect(cleanEmail("User@Acme.COM")).toBe("user@acme.com");
  });
  it("rejects garbage, empties, and over-long inputs", () => {
    expect(cleanEmail("not-an-email")).toBeNull();
    expect(cleanEmail("a@b")).toBeNull();
    expect(cleanEmail("")).toBeNull();
    expect(cleanEmail("a@@x.com")).toBeNull();
    expect(cleanEmail("a".repeat(250) + "@x.com")).toBeNull();
  });
});
