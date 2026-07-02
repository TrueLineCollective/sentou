import { nanoid } from "nanoid";
import type { Link } from "@/lib/store";
import { currentVersion } from "@/lib/links";
import { signTrackToken } from "@/lib/track-token";

export function trackingContext(
  link: Link,
  claim: { linkId: string; email: string; verified?: boolean } | null,
  visitorId?: string,
): { track: false } | { track: true; token: string } {
  if (!link.track) return { track: false };
  // Attribute opens to an email only when it was actually verified; an unverified viewer is
  // anonymous, so tracking never stores an address Sentou could not confirm. Key an anonymous
  // viewer by a stable per-browser id ("anon:<id>") rather than the bare constant "anon": with a
  // single "anon" bucket, recordOpen's per-viewer first-open check treats every distinct person
  // after the first as a repeat, so the owner's open-notification fires only once for the whole
  // link. A per-browser id makes distinct viewers distinct (each notifies once) while a refresh
  // by the same browser still dedupes. Falls back to "anon" when no id is supplied.
  const verified = claim && claim.linkId === link.id && claim.verified;
  const viewer = verified ? claim.email : visitorId ? `anon:${visitorId}` : "anon";
  const version = currentVersion(link);
  // 24h covers a long-open tab still firing its close beacon, while bounding indefinite replay.
  const token = signTrackToken({ linkId: link.id, version, viewer, eventId: nanoid(), exp: Date.now() + 24 * 3600_000 });
  return { track: true, token };
}
