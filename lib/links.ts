import { nanoid } from "nanoid";
import type { Gate, Link, LinkStore, Version, ViewEvent } from "@/lib/store";

export const OPEN_GATE: Gate = {
  requireEmail: false, allowedDomains: null, expiresAt: null, revoked: false,
};

function latestVersion(link: Link): Version {
  return link.versions.reduce((a, b) => (b.version > a.version ? b : a));
}

export function currentHtml(link: Link): string {
  return latestVersion(link).html;
}

// Single source of truth for "which version is live". Tracking attributes events to
// this same number the artifact route serves, so attribution can never drift from the
// HTML actually rendered even if versions ever become non-contiguous.
export function currentVersion(link: Link): number {
  return latestVersion(link).version;
}

// Every mutation does get -> mutate -> put against a single shared store, and that
// read-modify-write interleaves across the await boundary, clobbering whole records
// (a concurrent tracking beacon could otherwise lose a revoke, an open, or dwell).
// Serialize ALL mutations through one in-process chain so no concurrent write can be lost.
let writeChain: Promise<unknown> = Promise.resolve();
function serializeWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

export function createLink(
  store: LinkStore, html: string, gate: Gate = OPEN_GATE, track = false, verifyEmail = false,
): Promise<Link> {
  return serializeWrite(async () => {
    const now = new Date().toISOString();
    const link: Link = {
      id: nanoid(),
      slug: nanoid(12),
      versions: [{ version: 1, html, createdAt: now }],
      createdAt: now,
      // verifyEmail is meaningless without an email gate: paired with requireEmail=false
      // and no allowlist, evaluateAccess returns "open" and the code-send/verify flow never
      // runs, serving content unverified. Force the email gate on at the data layer so no
      // caller (now or future) can produce a verifyEmail link that resolves to an open gate.
      gate: { ...gate, requireEmail: gate.requireEmail || verifyEmail },
      viewers: [],
      track,
      verifyEmail,
      events: [],
      verifyAttempts: {},
    };
    await store.put(link);
    return link;
  });
}

export function recordOpen(store: LinkStore, e: ViewEvent): Promise<void> {
  return serializeWrite(async () => {
    const link = await store.get(e.linkId);
    if (!link) return;
    const i = link.events.findIndex((x) => x.eventId === e.eventId);
    if (i >= 0) {
      // A close beacon fires from both pagehide and visibilitychange, and beacons have
      // no delivery ordering. A duplicate/late open with the same eventId must not reset
      // an already-recorded dwell, so preserve a non-zero dwell on upsert.
      link.events[i] = { ...e, dwellMs: link.events[i].dwellMs > 0 ? link.events[i].dwellMs : e.dwellMs };
    } else {
      link.events.push(e);
    }
    if (link.events.length > 10000) link.events = link.events.slice(-10000);
    await store.put(link);
  });
}

export function recordClose(store: LinkStore, linkId: string, eventId: string, dwellMs: number): Promise<void> {
  return serializeWrite(async () => {
    const link = await store.get(linkId);
    if (!link) return;
    const ev = link.events.find((x) => x.eventId === eventId);
    if (ev) ev.dwellMs = Math.max(ev.dwellMs, dwellMs);
    await store.put(link);
  });
}

export function recordViewer(store: LinkStore, id: string, email: string): Promise<Link> {
  return serializeWrite(async () => {
    const link = await store.get(id);
    if (!link) throw new Error("link not found");
    if (link.viewers.some((v) => v.email === email)) return link;
    link.viewers.push({ email, at: new Date().toISOString() });
    if (link.viewers.length > 5000) link.viewers = link.viewers.slice(-5000);
    await store.put(link);
    return link;
  });
}

export function revokeLink(store: LinkStore, id: string): Promise<Link> {
  return serializeWrite(async () => {
    const link = await store.get(id);
    if (!link) throw new Error("link not found");
    link.gate.revoked = true;
    await store.put(link);
    return link;
  });
}

// Brute-force cap on the email verification code. The 6-digit code lives encrypted in a
// cookie, so an attacker can only guess it; without a cap they could try all 10^6 codes
// within the TTL and impersonate an address they don't control. Count attempts per
// (link, email); the caller locks past the cap. Reset on a fresh code or a success.
export function bumpVerifyAttempt(store: LinkStore, id: string, email: string): Promise<number> {
  return serializeWrite(async () => {
    const link = await store.get(id);
    if (!link) return Infinity;
    if (!link.verifyAttempts) link.verifyAttempts = {};
    const n = (link.verifyAttempts[email] ?? 0) + 1;
    link.verifyAttempts[email] = n;
    await store.put(link);
    return n;
  });
}

export function resetVerifyAttempt(store: LinkStore, id: string, email: string): Promise<void> {
  return serializeWrite(async () => {
    const link = await store.get(id);
    if (!link) return;
    if (!link.verifyAttempts) link.verifyAttempts = {};
    delete link.verifyAttempts[email];
    await store.put(link);
  });
}

export async function getLinkBySlug(store: LinkStore, slug: string): Promise<Link | null> {
  return store.getBySlug(slug);
}

export function republish(store: LinkStore, id: string, html: string): Promise<Link> {
  return serializeWrite(async () => {
    const link = await store.get(id);
    if (!link) throw new Error("link not found");
    const nextVersion = link.versions.length + 1;
    link.versions.push({ version: nextVersion, html, createdAt: new Date().toISOString() });
    await store.put(link);
    return link;
  });
}
