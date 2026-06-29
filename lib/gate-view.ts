import type { Link } from "@/lib/store";
import { evaluateAccess } from "@/lib/access";

export function gateState(
  link: Link,
  claim: { linkId: string; email: string } | null,
): "form" | "denied" | "open" {
  const email = claim && claim.linkId === link.id ? claim.email : undefined;
  const d = evaluateAccess(link, { email, now: new Date().toISOString() });
  if (d.allowed) return "open";
  if (d.reason === "revoked" || d.reason === "expired") return "denied";
  return "form";
}
