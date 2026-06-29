import { getLinkBySlug, currentHtml } from "@/lib/links";
import { getStore } from "@/lib/server-store";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await getLinkBySlug(getStore(), slug);
  if (!link) return new Response("Not found", { status: 404 });
  return new Response(currentHtml(link), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // `sandbox allow-scripts` re-imposes the iframe sandbox at the HTTP layer, so the
      // artifact runs in an opaque origin even when opened directly at /artifact/:slug
      // (outside the viewer iframe). Without this, rewriting /v/:slug -> /artifact/:slug
      // would execute user HTML as a full first-party document on this origin.
      "content-security-policy":
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; frame-ancestors 'self'; sandbox allow-scripts",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
