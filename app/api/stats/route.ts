import { getStore } from "@/lib/server-store";
import { aggregate } from "@/lib/stats";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  const link = await getStore().get(id);
  if (!link) return Response.json({ error: "not found" }, { status: 404 });
  const agg = aggregate(link.events);
  return Response.json({ linkId: id, ...agg });
}
