import { describe, it, expect } from "vitest";
import {
  isBlockedAddress,
  isObviouslyPrivateHost,
  assertSafeWebhookUrl,
  SsrfError,
} from "@/lib/ssrf";

describe("isBlockedAddress", () => {
  it("blocks private, loopback, link-local, and metadata IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.5.4",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "0.0.0.0",
      "100.64.0.1", // CGNAT
      "255.255.255.255",
      "224.0.0.1", // multicast
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("blocks loopback, unique-local, and link-local IPv6 (and v4-mapped forms)", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.113.10", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("blocks anything that is not a recognizable IP (fail closed)", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
  });
});

describe("isObviouslyPrivateHost", () => {
  it("flags localhost and literal private IPs without DNS", () => {
    expect(isObviouslyPrivateHost("localhost")).toBe(true);
    expect(isObviouslyPrivateHost("app.localhost")).toBe(true);
    expect(isObviouslyPrivateHost("127.0.0.1")).toBe(true);
    expect(isObviouslyPrivateHost("169.254.169.254")).toBe(true);
    expect(isObviouslyPrivateHost("::1")).toBe(true);
  });

  it("does not flag public hosts or literal public IPs", () => {
    expect(isObviouslyPrivateHost("hooks.slack.com")).toBe(false);
    expect(isObviouslyPrivateHost("8.8.8.8")).toBe(false);
  });
});

describe("assertSafeWebhookUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertSafeWebhookUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeWebhookUrl("gopher://x")).rejects.toBeInstanceOf(SsrfError);
  });

  it("rejects literal internal IPs (no DNS needed)", async () => {
    await expect(assertSafeWebhookUrl("http://127.0.0.1/x")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeWebhookUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeWebhookUrl("http://10.0.0.5:8080/hook")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeWebhookUrl("http://[::1]/x")).rejects.toBeInstanceOf(SsrfError);
  });

  it("allows a literal public IP", async () => {
    await expect(assertSafeWebhookUrl("https://8.8.8.8/hook")).resolves.toBeUndefined();
  });

  it("rejects a malformed URL", async () => {
    await expect(assertSafeWebhookUrl("not a url")).rejects.toBeInstanceOf(SsrfError);
  });
});
