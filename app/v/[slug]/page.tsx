import { notFound } from "next/navigation";
import { getLinkBySlug } from "@/lib/links";
import { getStore } from "@/lib/server-store";

export default async function ViewerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await getLinkBySlug(getStore(), slug);
  if (!link) notFound();
  return (
    <main style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <iframe
        title="artifact"
        src={`/artifact/${slug}`}
        sandbox="allow-scripts"
        style={{ flex: 1, width: "100%", border: "none" }}
      />
    </main>
  );
}
