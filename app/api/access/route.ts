import { getLinkBySlug, recordViewer } from "@/lib/links";
import { getStore, linkUrl } from "@/lib/server-store";
import { evaluateAccess } from "@/lib/access";
import { signAccessToken } from "@/lib/token";
import { cookieName, verifyCookieName } from "@/lib/cookies";
import { newCode, sealVerify } from "@/lib/verify";
import { getSender } from "@/lib/email";

export async function POST(req: Request) {
  // The shipped viewer submits a native HTML <form> (application/x-www-form-urlencoded);
  // API/MCP callers send JSON. Parse both, and answer in kind: a browser form gets a 303
  // back to the viewer so the new cookie loads the artifact, JSON callers get JSON.
  const ct = req.headers.get("content-type") ?? "";
  const isForm = ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");

  let slug: string | undefined;
  let email: string | undefined;
  if (isForm) {
    const form = await req.formData().catch(() => null);
    const s = form?.get("slug");
    const e = form?.get("email");
    slug = typeof s === "string" ? s : undefined;
    email = typeof e === "string" ? e : undefined;
  } else {
    const body = await req.json().catch(() => ({}));
    if (typeof body.slug === "string") slug = body.slug;
    if (typeof body.email === "string") email = body.email;
  }
  if (!slug) {
    const q = new URL(req.url).searchParams.get("slug");
    if (q) slug = q;
  }

  const fail = (status: number, reason: string) =>
    isForm
      ? new Response(reason, { status, headers: { "content-type": "text/plain; charset=utf-8" } })
      : Response.json({ error: reason }, { status });

  if (!slug || !email) return fail(400, "slug and email are required");

  const store = getStore();
  const link = await getLinkBySlug(store, slug);
  if (!link) return fail(404, "not found");

  const decision = evaluateAccess(link, { email, now: new Date().toISOString() });
  if (!decision.allowed) return fail(403, decision.reason);

  if (link.verifyEmail) {
    const code = newCode();
    const token = sealVerify({ slug, email, code, exp: Date.now() + 600_000 });
    await getSender().sendCode(email, code);
    const verifyCookie = `${verifyCookieName(slug)}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
    if (isForm) {
      return new Response(null, {
        status: 303,
        headers: { location: `/v/${slug}?step=code&email=${encodeURIComponent(email)}`, "set-cookie": verifyCookie },
      });
    }
    const res = Response.json({ status: "code_sent" });
    res.headers.set("set-cookie", verifyCookie);
    return res;
  }

  await recordViewer(store, link.id, email);
  const token = signAccessToken({ linkId: link.id, email });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${cookieName(slug)}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${secure}`;

  if (isForm) {
    return new Response(null, { status: 303, headers: { location: `/v/${slug}`, "set-cookie": cookie } });
  }
  const res = Response.json({ ok: true, url: linkUrl(slug) });
  res.headers.set("set-cookie", cookie);
  return res;
}
