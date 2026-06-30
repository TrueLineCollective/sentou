import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
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
  ownerUserId?: string | null;
  versions: Version[];
  createdAt: string;
  gate: Gate;
  viewers: Viewer[];
  track: boolean;
  verifyEmail: boolean;
  events: ViewEvent[];
  verifyAttempts: Record<string, number>;
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

// Fill defaults for fields added after a record was first written, so a store file from an
// older Sentou (pre-tracking, pre-verify) deserializes into a complete Link instead of
// crashing read sites that assume events/viewers/etc. exist. One chokepoint covers every read.
function normalizeLink(raw: Record<string, unknown>): Link {
  const r = raw as Partial<Link>;
  return {
    id: String(r.id),
    slug: String(r.slug),
    ownerUserId: r.ownerUserId ?? null,
    versions: r.versions ?? [],
    createdAt: String(r.createdAt),
    gate: r.gate ?? { requireEmail: false, allowedDomains: null, expiresAt: null, revoked: false },
    viewers: r.viewers ?? [],
    track: r.track ?? false,
    verifyEmail: r.verifyEmail ?? false,
    events: r.events ?? [],
    verifyAttempts: r.verifyAttempts ?? {},
  };
}

export function createFileStore(filePath: string): LinkStore {
  const load = (): Record<string, Link> => {
    if (!existsSync(filePath)) return {};
    const text = readFileSync(filePath, "utf8");
    let parsed: Record<string, Record<string, unknown>>;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Do NOT swallow into {}: that lets the next write overwrite a corrupt-but-recoverable
      // file with an empty store and silently lose every link, including revokes. Fail loud and
      // leave the bytes on disk so an operator can inspect or restore them.
      throw new Error(
        `sentou: store file ${filePath} is not valid JSON. Refusing to read it so a write cannot ` +
          `overwrite and erase your links. Back up and inspect the file, then remove or fix it.`,
      );
    }
    const out: Record<string, Link> = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = normalizeLink(v);
    return out;
  };
  const save = (data: Record<string, Link>) => {
    mkdirSync(dirname(filePath), { recursive: true });
    // Write to a temp file then rename: rename is atomic on the same filesystem, so a reader
    // (or a crash mid-write) sees either the whole old file or the whole new one, never a
    // truncated half that would fail to parse and trip the corrupt-file guard above.
    const tmp = `${filePath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, filePath);
  };
  return {
    async put(link) { const d = load(); d[link.id] = link; save(d); },
    async get(id) { return load()[id] ?? null; },
    async getBySlug(slug) {
      return Object.values(load()).find((l) => l.slug === slug) ?? null;
    },
  };
}
