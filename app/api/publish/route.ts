import { createLink, OPEN_GATE } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";
import { requireOwner } from "@/lib/owner";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { emailConfigured } from "@/lib/email";

export async function POST(req: Request) {
  const rl = rateLimit(`publish:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return Response.json({ error: "rate limited" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  if (!requireOwner(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  // Cap the body before parsing: even an authed caller shouldn't be able to POST gigabytes of
  // HTML, which the whole-file-rewrite store would then re-serialize on every later write.
  if (Number(req.headers.get("content-length") || 0) > 5_000_000) {
    return Response.json({ error: "request too large" }, { status: 413 });
  }
  const body = await req.json().catch(() => ({}));
  const html = typeof body.html === "string" ? body.html : "";
  if (!html.trim()) return Response.json({ error: "html is required" }, { status: 400 });

  // Reject a malformed expiry at the boundary instead of silently storing a date that
  // evaluateAccess can never parse (which would otherwise make the link never expire).
  let expiresAt: string | null = null;
  if (typeof body.expiresAt === "string") {
    if (Number.isNaN(new Date(body.expiresAt).getTime())) {
      return Response.json({ error: "expiresAt is not a valid date" }, { status: 400 });
    }
    expiresAt = body.expiresAt;
  }

  // Keep only non-empty string domains: a non-string element would throw at
  // .toLowerCase() on every access (500), and an empty entry would let a domainless
  // email slip the allowlist.
  const domains = Array.isArray(body.allowedDomains)
    ? body.allowedDomains
        .filter((d: unknown): d is string => typeof d === "string" && d.trim() !== "")
        .map((d: string) => d.trim())
    : null;

  const gate = {
    ...OPEN_GATE,
    requireEmail: body.requireEmail === true,
    allowedDomains: domains && domains.length ? domains : null,
    expiresAt,
  };
  const track = body.track === true;
  const verifyEmail = body.verifyEmail === true;
  // A verifyEmail link with no sender configured can never deliver a code: refuse it in
  // production rather than minting a link whose recipients hit a dead end (and whose codes would
  // otherwise be console-logged). Local dev keeps the console-sender fallback for testing, with
  // an on-screen note in the viewer so it isn't a silent dead-end there.
  if (verifyEmail && !emailConfigured() && process.env.NODE_ENV === "production") {
    return Response.json(
      { error: "verifyEmail requires an email sender; set SENTOU_RESEND_KEY + SENTOU_EMAIL_FROM" },
      { status: 400 },
    );
  }
  const link = await createLink(getStore(), html, gate, track, verifyEmail);
  return Response.json({ id: link.id, slug: link.slug, url: linkUrl(link.slug), version: 1 });
}
