import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export type Version = { version: number; html: string; createdAt: string };
export type Gate = {
  requireEmail: boolean;
  allowedDomains: string[] | null;
  expiresAt: string | null;
  revoked: boolean;
};
export type Viewer = { email: string; at: string };
export type ViewEvent = {
  eventId: string;
  linkId: string;
  viewer: string;
  version: number;
  openedAt: string;
  dwellMs: number;
};
export type Link = {
  id: string;
  slug: string;
  versions: Version[];
  createdAt: string;
  gate: Gate;
  viewers: Viewer[];
  track: boolean;
  events: ViewEvent[];
};

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

export function createFileStore(filePath: string): LinkStore {
  const load = (): Record<string, Link> => {
    if (!existsSync(filePath)) return {};
    try { return JSON.parse(readFileSync(filePath, "utf8")); } catch { return {}; }
  };
  const save = (data: Record<string, Link>) => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data, null, 2));
  };
  return {
    async put(link) { const d = load(); d[link.id] = link; save(d); },
    async get(id) { return load()[id] ?? null; },
    async getBySlug(slug) {
      return Object.values(load()).find((l) => l.slug === slug) ?? null;
    },
  };
}
