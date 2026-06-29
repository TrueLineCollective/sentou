import type { Link } from "@/lib/store";

export type AccessReason = "ok" | "revoked" | "expired" | "email_required" | "domain_blocked";
export type AccessDecision = { allowed: boolean; reason: AccessReason };

function domainOf(email: string): string {
  return (email.split("@")[1] ?? "").toLowerCase();
}

export function evaluateAccess(link: Link, ctx: { email?: string; now: string }): AccessDecision {
  const g = link.gate;
  if (g.revoked) return { allowed: false, reason: "revoked" };
  if (g.expiresAt && new Date(g.expiresAt).getTime() <= new Date(ctx.now).getTime()) {
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
