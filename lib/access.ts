import type { Link } from "@/lib/store";

export type AccessReason = "ok" | "revoked" | "expired" | "email_required" | "domain_blocked";
export type AccessDecision = { allowed: boolean; reason: AccessReason };

function domainOf(email: string): string {
  // The RFC domain is the label after the LAST '@', not the second segment.
  // "a@acme.com@evil.com" resolves to evil.com, not acme.com.
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

export function evaluateAccess(link: Link, ctx: { email?: string; now: string }): AccessDecision {
  const g = link.gate;
  if (g.revoked) return { allowed: false, reason: "revoked" };
  // Fail closed on expiry: an unparseable expiresAt (getTime() === NaN) is treated
  // as already expired rather than never-expiring, so a bad date never leaves a link open.
  const exp = g.expiresAt ? new Date(g.expiresAt).getTime() : null;
  if (exp !== null && (Number.isNaN(exp) || exp <= new Date(ctx.now).getTime())) {
    return { allowed: false, reason: "expired" };
  }
  const hasAllowlist = !!g.allowedDomains && g.allowedDomains.length > 0;
  const needsEmail = g.requireEmail || hasAllowlist;
  if (needsEmail && !ctx.email) return { allowed: false, reason: "email_required" };
  if (hasAllowlist) {
    const allowed = g.allowedDomains!.map((d) => d.toLowerCase());
    if (!allowed.includes(domainOf(ctx.email!))) return { allowed: false, reason: "domain_blocked" };
  }
  return { allowed: true, reason: "ok" };
}
