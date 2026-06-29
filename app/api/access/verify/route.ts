import { getLinkBySlug, recordViewer, bumpVerifyAttempt, resetVerifyAttempt } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";
import { evaluateAccess } from "@/lib/access";
import { openVerify } from "@/lib/verify";
import { signAccessToken } from "@/lib/token";
import { cookieName, verifyCookieName } from "@/lib/cookies";
import { cleanEmail } from "@/lib/email-format";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { timingSafeEqual } from "node:crypto";

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return decodeURIComponent(v.join("=")); }
  return null;
}

// Constant-time code compare: a char-by-char === short-circuits on the first mismatch,
// leaking how many leading digits are correct and turning the per-code guess budget into
// a digit-at-a-time oracle. Length-check first (lengths aren't secret), then timingSafeEqual.
function codeMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // Same dual-path contract as /api/access: the shipped viewer submits a native
  // urlencoded <form> and wants a 303 back to the viewer so the access cookie loads
  // the artifact; API/MCP callers send JSON and want JSON back.
  const ct = req.headers.get("content-type") ?? "";
  const isForm = ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");

  const fail = (status: number, reason: string, headers?: Record<string, string>) =>
    isForm
      ? new Response(reason, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } })
      : Response.json({ error: reason }, { status, headers });

  const rl = rateLimit(`verify:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return fail(429, "too many requests; slow down", { "retry-after": String(rl.retryAfterSec) });
  if (Number(req.headers.get("content-length") || 0) > 8192) return fail(413, "request too large");

  let slug: string | undefined;
  let rawEmail: string | undefined;
  let code: string | undefined;
  if (isForm) {
    const form = await req.formData().catch(() => null);
    const s = form?.get("slug");
    const e = form?.get("email");
    const c = form?.get("code");
    slug = typeof s === "string" ? s : undefined;
    rawEmail = typeof e === "string" ? e : undefined;
    code = typeof c === "string" ? c : undefined;
  } else {
    const body = await req.json().catch(() => ({}));
    if (typeof body.slug === "string") slug = body.slug;
    if (typeof body.email === "string") rawEmail = body.email;
    if (typeof body.code === "string") code = body.code;
  }
  if (!slug) {
    const q = new URL(req.url).searchParams.get("slug");
    if (q) slug = q;
  }

  if (!slug || !rawEmail || !code) return fail(400, "slug, email, code required");
  const email = cleanEmail(rawEmail);
  if (!email) return fail(400, "a valid email is required");
  const link = await getLinkBySlug(getStore(), slug);
  if (!link) return fail(404, "not found");

  // Read the verify cookie BEFORE spending any attempt budget. Only a request that carries a
  // real, unexpired verify cookie for this {slug,email} can consume the per-code attempts;
  // otherwise a third party who merely knows {slug,email} could POST junk codes with no cookie
  // and burn the budget to 429-lock the genuine recipient. Same generic 401 for both cases so
  // we don't reveal whether a cookie was present.
  const claim = openVerify(readCookie(req, verifyCookieName(slug)));
  const cookieValid = !!claim && claim.slug === slug && claim.email === email && Date.now() < claim.exp;
  if (!cookieValid) return fail(401, "invalid or expired code");

  const attempts = await bumpVerifyAttempt(getStore(), link.id, email);
  if (attempts > 5) return fail(429, "too many attempts; request a new code");

  if (!codeMatches(claim!.code, String(code))) return fail(401, "invalid or expired code");
  if (!evaluateAccess(link, { email, now: new Date().toISOString() }).allowed) return fail(403, "denied");

  await resetVerifyAttempt(getStore(), link.id, email);
  // Email proven: this is the only path that persists a viewer, so the store only ever holds
  // verified addresses. The token is marked verified so tracking can attribute opens to it.
  await recordViewer(getStore(), link.id, email);
  const token = signAccessToken({ linkId: link.id, email, verified: true });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${cookieName(slug)}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${secure}`;
  // Single-use: now that an access cookie is issued, kill the verify cookie so its code
  // can't be replayed within the remaining TTL.
  const clearVerify = `${verifyCookieName(slug)}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
  const headers = new Headers();
  headers.append("set-cookie", cookie);
  headers.append("set-cookie", clearVerify);
  if (isForm) {
    headers.set("location", `/v/${slug}`);
    return new Response(null, { status: 303, headers });
  }
  const res = Response.json({ ok: true, url: linkUrl(slug) });
  res.headers.append("set-cookie", cookie);
  res.headers.append("set-cookie", clearVerify);
  return res;
}
