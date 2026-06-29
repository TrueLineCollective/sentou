export type Version = { version: number; html: string; createdAt: string };
export type Link = { id: string; slug: string; versions: Version[]; createdAt: string };

export interface LinkStore {
  put(link: Link): Promise<void>;
  get(id: string): Promise<Link | null>;
  getBySlug(slug: string): Promise<Link | null>;
}

export function createMemoryStore(): LinkStore {
  const byId = new Map<string, Link>();
  return {
    async put(link) { byId.set(link.id, link); },
    async get(id) { return byId.get(id) ?? null; },
    async getBySlug(slug) {
      for (const link of byId.values()) if (link.slug === slug) return link;
      return null;
    },
  };
}
