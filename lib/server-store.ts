import { createFileStore } from "@/lib/store";
import type { LinkStore } from "@/lib/store";

let store: LinkStore | null = null;
export function getStore(): LinkStore {
  if (!store) store = createFileStore(process.env.SENTOU_DB ?? ".sentou/db.json");
  return store;
}
export function linkUrl(slug: string): string {
  return `${process.env.SENTOU_BASE_URL ?? "http://localhost:3000"}/v/${slug}`;
}
