import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { getPublicCollectionWithLinks } from "@/lib/collections";

export const dynamic = "force-dynamic";

export default async function PublicCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const db = getDb();
  const result = getPublicCollectionWithLinks(db, slug);
  if (!result) notFound();

  const { collection, links } = result;

  const baseUrl =
    process.env.SENTOU_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    "";

  return (
    <main className="transit-canvas min-h-dvh" style={{ backgroundColor: "#1a1b26" }}>
      {/* Blueprint grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: `
            linear-gradient(rgba(192,202,245,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(192,202,245,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 max-w-xl mx-auto px-6 py-16">
        {/* Header */}
        <header className="mb-12">
          <p className="text-[9px] font-mono tracking-[0.4em] uppercase text-[#565f89] mb-3">
            Sentou · Collection
          </p>
          <h1
            className="text-3xl font-black leading-tight"
            style={{
              color: "#c0caf5",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
            }}
          >
            {collection.title}
            <span style={{ color: "#7ee787" }} aria-hidden="true">.</span>
          </h1>
          <p className="text-[10px] font-mono mt-2" style={{ color: "#565f89" }}>
            {links.length} {links.length === 1 ? "stop" : "stops"} on this line
          </p>
        </header>

        {/* Line + Stops */}
        {links.length === 0 ? (
          <div
            className="border rounded-lg py-12 text-center"
            style={{ borderColor: "#292e42" }}
          >
            <p className="text-sm" style={{ color: "#565f89" }}>
              This collection has no stops yet.
            </p>
          </div>
        ) : (
          <ol aria-label={`Stops in ${collection.title}`} className="relative">
            {/* Vertical spine */}
            <div
              className="absolute top-3 bottom-3"
              style={{
                left: "9px",
                width: "2px",
                background: "linear-gradient(to bottom, #c0caf5 0%, #7ee787 100%)",
                opacity: 0.3,
                borderRadius: "1px",
              }}
              aria-hidden="true"
            />

            {links.map((link, idx) => {
              const isLast = idx === links.length - 1;
              const isFirst = idx === 0;
              const label = link.title ?? link.slug;
              const viewerUrl = `${baseUrl}/v/${link.slug}`;

              const dotColor = isFirst
                ? "#c0caf5"
                : isLast
                  ? "#7ee787"
                  : "#c0caf5";
              const dotShadow = isLast
                ? "0 0 8px rgba(126,231,135,0.5)"
                : "0 0 4px rgba(192,202,245,0.3)";

              return (
                <li key={link.linkId} className="relative flex items-start gap-5 pb-8 last:pb-0">
                  {/* Station dot */}
                  <div
                    className="relative z-10 flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      border: `2px solid ${dotColor}`,
                      backgroundColor: "#1a1b26",
                      boxShadow: dotShadow,
                    }}
                  />

                  {/* Stop content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    {/* Stop number label */}
                    <p
                      className="text-[8px] font-mono tracking-[0.35em] uppercase mb-1"
                      style={{ color: "#565f89" }}
                    >
                      Stop {String(idx + 1).padStart(2, "0")}
                    </p>

                    {/* Link to the viewer */}
                    <Link
                      href={viewerUrl}
                      className="group inline-flex items-center gap-2"
                    >
                      <span
                        className="text-base font-semibold leading-snug group-hover:underline"
                        style={{ color: "#c0caf5" }}
                      >
                        {label}
                      </span>
                      <span
                        className="text-[9px] font-mono tracking-[0.15em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        style={{ color: "#7ee787" }}
                        aria-hidden="true"
                      >
                        → open
                      </span>
                    </Link>

                    <p
                      className="text-[10px] font-mono mt-0.5"
                      style={{ color: "#565f89" }}
                    >
                      /v/{link.slug}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6" style={{ borderTop: "1px solid #292e42" }}>
          <p
            className="text-[9px] font-mono tracking-[0.3em] uppercase text-center"
            style={{ color: "#292e42" }}
          >
            Powered by Sentou
          </p>
        </footer>
      </div>
    </main>
  );
}
