import { nanoid } from "nanoid";
import type { Link } from "@/lib/store";
import { currentVersion } from "@/lib/links";
import { signTrackToken } from "@/lib/track-token";

export function trackingContext(
  link: Link,
  claim: { linkId: string; email: string } | null,
): { track: false } | { track: true; token: string } {
  if (!link.track) return { track: false };
  const viewer = claim && claim.linkId === link.id ? claim.email : "anon";
  const version = currentVersion(link);
  // 24h covers a long-open tab still firing its close beacon, while bounding indefinite replay.
  const token = signTrackToken({ linkId: link.id, version, viewer, eventId: nanoid(), exp: Date.now() + 24 * 3600_000 });
  return { track: true, token };
}
