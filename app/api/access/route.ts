import { getLinkBySlug, resetVerifyAttempt } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";
import { evaluateAccess } from "@/lib/access";
import { signAccessToken, ACCESS_TTL_MS } from "@/lib/token";
import { cookieName, verifyCookieName } from "@/lib/cookies";
import { newCode, sealVerify } from "@/lib/verify";
import { getSender } from "@/lib/email";
import { cleanEmail } from "@/lib/email-format";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { secureCookies } from "@/lib/owner";

export async function POST(req: Request) {
  // The shipped viewer submits a native HTML <form> (application/x-www-form-urlencoded);
  // API/MCP callers send JSON. Parse both, and answer in kind: a browser form gets a 303
  // back to the viewer so the new cookie loads the artifact, JSON callers get JSON.
  const ct = req.headers.get("content-type") ?? "";
  const isForm = ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");

  const fail = (status: number, reason: string, headers?: Record<string, string>) =>
    isForm
      ? new Response(reason, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } })
      : Response.json({ error: reason }, { status, headers });

  // This route is unauthenticated by design (recipients aren't the owner), so it carries the
  // abuse controls: per-IP rate limit, a body-size cap before parsing, and a per-address cap on
  // code sends below so it can't be turned into an email cannon billed to the owner's sender.
  const ipRl = rateLimit(`access:${clientIp(req)}`, 20, 60_000);
  if (!ipRl.ok) return fail(429, "too many requests; slow down", { "retry-after": String(ipRl.retryAfterSec) });
  if (Number(req.headers.get("content-length") || 0) > 8192) return fail(413, "request too large");

  let slug: string | undefined;
  let rawEmail: string | undefined;
  if (isForm) {
    const form = await req.formData().catch(() => null);
    const s = form?.get("slug");
    const e = form?.get("email");
    slug = typeof s === "string" ? s : undefined;
    rawEmail = typeof e === "string" ? e : undefined;
  } else {
    const body = await req.json().catch(() => ({}));
    if (typeof body.slug === "string") slug = body.slug;
    if (typeof body.email === "string") rawEmail = body.email;
  }
  if (!slug) {
    const q = new URL(req.url).searchParams.get("slug");
    if (q) slug = q;
  }

  if (!slug || !rawEmail) return fail(400, "slug and email are required");
  const email = cleanEmail(rawEmail);
  if (!email) return fail(400, "a valid email is required");

  const store = getStore();
  const link = await getLinkBySlug(store, slug);
  if (!link) return fail(404, "not found");

  const decision = evaluateAccess(link, { email, now: new Date().toISOString() });
  if (!decision.allowed) return fail(403, decision.reason);

  if (link.verifyEmail) {
    // Cap codes per address per window, independent of the per-IP limit above (which an attacker
    // could dodge by rotating IPs while hammering one address to bury a real recipient in mail).
    const codeRl = rateLimit(`code:${email}`, 5, 15 * 60_000);
    if (!codeRl.ok) return fail(429, "too many codes requested for this address; try again later", { "retry-after": String(codeRl.retryAfterSec) });
    await resetVerifyAttempt(store, link.id, email); // a fresh code starts a fresh attempt budget
    const code = newCode();
    const token = sealVerify({ slug, email, code, exp: Date.now() + 600_000 });
    await getSender().sendCode(email, code);
    const verifyCookie = `${verifyCookieName(slug)}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${secureCookies() ? "; Secure" : ""}`;
    if (isForm) {
      // The email rides in the sealed verify cookie, not the redirect URL: a ?email= query lands
      // in proxy access logs and browser history, which is a needless exposure of the recipient.
      return new Response(null, {
        status: 303,
        headers: { location: `/v/${slug}?step=code`, "set-cookie": verifyCookie },
      });
    }
    const res = Response.json({ status: "code_sent" });
    res.headers.set("set-cookie", verifyCookie);
    return res;
  }

  // Record-only gate: the typed email is access friction, not a proven identity, so we do NOT
  // persist it. Sentou only ever stores an address it verified. The email rides in the cookie so
  // this session's domain-allowlist check still works; enable verifyEmail to capture viewers.
  const token = signAccessToken({ linkId: link.id, email, verified: false });
  const secure = secureCookies() ? "; Secure" : "";
  const cookie = `${cookieName(slug)}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ACCESS_TTL_MS / 1000}${secure}`;

  if (isForm) {
    return new Response(null, { status: 303, headers: { location: `/v/${slug}`, "set-cookie": cookie } });
  }
  const res = Response.json({ ok: true, url: linkUrl(slug) });
  res.headers.set("set-cookie", cookie);
  return res;
}
