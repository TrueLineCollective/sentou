import { createLink, OPEN_GATE } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";

export async function POST(req: Request) {
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
  const link = await createLink(getStore(), html, gate);
  return Response.json({ id: link.id, slug: link.slug, url: linkUrl(link.slug), version: 1 });
}
