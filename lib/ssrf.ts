// SSRF guard for the member-configurable notification webhook.
//
// Any authenticated user (including a plain `member`) can set their own webhook URL, and the
// server POSTs to it when one of their links is opened. Without a guard that POST can reach
// internal services on the host (link-local metadata, loopback admin ports, RFC1918 ranges),
// turning a benign feature into a blind internal request primitive.
//
// The authoritative check is at fetch time: resolve the host and inspect every resolved
// address. A literal IP is checked directly. `redirect: "manual"` at the call site stops a
// 30x from bouncing to an internal target after the check passes.
//
// Known, accepted residual: a host that resolves to a public IP here but to a private IP on
// the actual fetch (DNS rebinding / TOCTOU) is not defended against, since that needs
// per-connection IP pinning at the socket layer. The exposure is bounded: the trigger is
// authenticated, the response body is never returned to the caller (blind), and the request
// is POST-only with no attacker header control. Do not reuse this module for untrusted
// multi-tenant egress without adding socket-level pinning.

import net from "node:net";
import { lookup } from "node:dns/promises";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// Private, loopback, link-local, multicast, and reserved ranges that a webhook must not reach.
const blocked = new net.BlockList();
// IPv4
blocked.addSubnet("0.0.0.0", 8, "ipv4"); // "this host"
blocked.addSubnet("10.0.0.0", 8, "ipv4"); // RFC1918
blocked.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
blocked.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
blocked.addSubnet("169.254.0.0", 16, "ipv4"); // link-local (incl. 169.254.169.254 metadata)
blocked.addSubnet("172.16.0.0", 12, "ipv4"); // RFC1918
blocked.addSubnet("192.0.0.0", 24, "ipv4"); // IETF protocol assignments
blocked.addSubnet("192.168.0.0", 16, "ipv4"); // RFC1918
blocked.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
blocked.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
blocked.addSubnet("240.0.0.0", 4, "ipv4"); // reserved
blocked.addAddress("255.255.255.255", "ipv4"); // broadcast
// IPv6
blocked.addAddress("::1", "ipv6"); // loopback
blocked.addAddress("::", "ipv6"); // unspecified
blocked.addSubnet("fc00::", 7, "ipv6"); // unique local
blocked.addSubnet("fe80::", 10, "ipv6"); // link-local
blocked.addSubnet("ff00::", 8, "ipv6"); // multicast

// True when `ip` falls in a range a server-side request must not reach. Anything that does
// not parse as a known IP family is blocked (fail closed).
export function isBlockedAddress(ip: string): boolean {
  let addr = ip;
  let family = net.isIP(addr);
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) -> evaluate the embedded IPv4.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(addr);
  if (mapped) {
    addr = mapped[1];
    family = 4;
  }
  if (family === 0) return true;
  return blocked.check(addr, family === 4 ? "ipv4" : "ipv6");
}

// Synchronous, no-DNS check for set time: reject obviously-internal hosts (localhost, a
// literal private/loopback IP) so the dashboard can fail fast with a clear 400. The
// authoritative guard is still assertSafeWebhookUrl at fetch time.
export function isObviouslyPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (net.isIP(h)) return isBlockedAddress(h);
  return false;
}

// Throws SsrfError unless `rawUrl` is an http(s) URL whose host resolves entirely to public
// addresses. Resolves every A/AAAA record and blocks if ANY of them is internal.
export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Webhook URL is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Webhook URL must use http or https.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new SsrfError("Webhook host resolves to a private address.");
    return;
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new SsrfError("Webhook host could not be resolved.");
  }
  if (resolved.length === 0) throw new SsrfError("Webhook host could not be resolved.");
  for (const { address } of resolved) {
    if (isBlockedAddress(address)) {
      throw new SsrfError("Webhook host resolves to a private address.");
    }
  }
}
