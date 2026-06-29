import { revokeLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import { requireOwner } from "@/lib/owner";

export async function POST(req: Request) {
  if (!requireOwner(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  try {
    await revokeLink(getStore(), id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "link not found" }, { status: 404 });
  }
}
