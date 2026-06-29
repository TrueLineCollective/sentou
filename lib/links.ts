import { nanoid } from "nanoid";
import type { Gate, Link, LinkStore, ViewEvent } from "@/lib/store";

export const OPEN_GATE: Gate = {
  requireEmail: false, allowedDomains: null, expiresAt: null, revoked: false,
};

export function currentHtml(link: Link): string {
  return link.versions.reduce((a, b) => (b.version > a.version ? b : a)).html;
}

export async function createLink(
  store: LinkStore, html: string, gate: Gate = OPEN_GATE, track = false,
): Promise<Link> {
  const now = new Date().toISOString();
  const link: Link = {
    id: nanoid(),
    slug: nanoid(12),
    versions: [{ version: 1, html, createdAt: now }],
    createdAt: now,
    gate: { ...gate },
    viewers: [],
    track,
    events: [],
  };
  await store.put(link);
  return link;
}

export async function recordOpen(store: LinkStore, e: ViewEvent): Promise<void> {
  const link = await store.get(e.linkId);
  if (!link) return;
  const i = link.events.findIndex((x) => x.eventId === e.eventId);
  if (i >= 0) link.events[i] = e; else link.events.push(e);
  await store.put(link);
}

export async function recordClose(store: LinkStore, linkId: string, eventId: string, dwellMs: number): Promise<void> {
  const link = await store.get(linkId);
  if (!link) return;
  const ev = link.events.find((x) => x.eventId === eventId);
  if (ev) ev.dwellMs = dwellMs;
  await store.put(link);
}

export async function recordViewer(store: LinkStore, id: string, email: string): Promise<Link> {
  const link = await store.get(id);
  if (!link) throw new Error("link not found");
  link.viewers.push({ email, at: new Date().toISOString() });
  await store.put(link);
  return link;
}

export async function revokeLink(store: LinkStore, id: string): Promise<Link> {
  const link = await store.get(id);
  if (!link) throw new Error("link not found");
  link.gate.revoked = true;
  await store.put(link);
  return link;
}

export async function getLinkBySlug(store: LinkStore, slug: string): Promise<Link | null> {
  return store.getBySlug(slug);
}

export async function republish(store: LinkStore, id: string, html: string): Promise<Link> {
  const link = await store.get(id);
  if (!link) throw new Error("link not found");
  const nextVersion = link.versions.length + 1;
  link.versions.push({ version: nextVersion, html, createdAt: new Date().toISOString() });
  await store.put(link);
  return link;
}
