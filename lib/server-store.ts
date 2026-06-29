import { createFileStore } from "@/lib/store";
import type { LinkStore } from "@/lib/store";

let store: LinkStore | null = null;
let storePath: string | null = null;
export function getStore(): LinkStore {
  // Re-read SENTOU_DB so a changed path rebinds the store. In production the env
  // is fixed, so the store is created once; in tests, a fresh per-test SENTOU_DB
  // (set in beforeEach) now actually isolates instead of reusing the first path.
  const path = process.env.SENTOU_DB ?? ".sentou/db.json";
  if (!store || storePath !== path) {
    store = createFileStore(path);
    storePath = path;
  }
  return store;
}
export function linkUrl(slug: string): string {
  return `${process.env.SENTOU_BASE_URL ?? "http://localhost:3000"}/v/${slug}`;
}
