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
      "content-security-policy":
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
