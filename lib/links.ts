import { nanoid } from "nanoid";
import type { Link, LinkStore } from "@/lib/store";

export function currentHtml(link: Link): string {
  return link.versions.reduce((a, b) => (b.version > a.version ? b : a)).html;
}

export async function createLink(store: LinkStore, html: string): Promise<Link> {
  const now = new Date().toISOString();
  const link: Link = {
    id: nanoid(),
    slug: nanoid(12),
    versions: [{ version: 1, html, createdAt: now }],
    createdAt: now,
  };
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
