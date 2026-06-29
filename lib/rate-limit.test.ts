import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, clientIp, __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => __resetRateLimits());

describe("rateLimit", () => {
  it("allows up to the limit then blocks within the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t0).ok).toBe(true);
    const blocked = rateLimit("k", 3, 1000, t0 + 1);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
  it("resets after the window elapses", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 1000, t0);
    expect(rateLimit("k", 3, 1000, t0 + 1001).ok).toBe(true);
  });
  it("keys are independent", () => {
    expect(rateLimit("a", 1, 1000, 5).ok).toBe(true);
    expect(rateLimit("a", 1, 1000, 5).ok).toBe(false);
    expect(rateLimit("b", 1, 1000, 5).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for hop", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
  it("falls back to a shared bucket when no proxy header is present", () => {
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
