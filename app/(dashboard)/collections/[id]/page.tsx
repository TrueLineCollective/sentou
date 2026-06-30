import Link from "next/link";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { resolveRole, isAdmin } from "@/lib/auth-session";
import { getCollectionById, getCollectionLinks } from "@/lib/collections";
import { CopyButton } from "@/components/transit/CopyButton";
import { addLinkAction, removeLinkAction, moveLinkAction } from "../actions";

export const dynamic = "force-dynamic";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) return null;

  const db = getDb();
  const userId = session.user.id;
  const role = resolveRole(db, userId);
  const admin = isAdmin({ userId, role });

  const collection = getCollectionById(db, id);
  if (!collection) notFound();

  // Access check: only owner or admin may edit.
  if (collection.ownerUserId !== userId && !admin) notFound();

  const memberLinks = getCollectionLinks(db, id);
  const memberLinkIds = new Set(memberLinks.map((l) => l.linkId));

  // Links the actor can add (their own, not already in this collection).
  const candidateLinks = db
    .select({ id: schema.links.id, slug: schema.links.slug, title: schema.links.title })
    .from(schema.links)
    .where(admin ? undefined : eq(schema.links.ownerUserId, userId))
    .all()
    .filter((l) => !memberLinkIds.has(l.id));

  const baseUrl =
    process.env.SENTOU_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    "";
  const shareUrl = `${baseUrl}/c/${collection.slug}`;

  return (
    <div className="min-h-dvh">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-transit-canvas/95 backdrop-blur-sm border-b border-transit-border px-4 md:px-8 py-5">
        <div className="flex items-center gap-2.5 mb-1">
          <Link
            href="/collections"
            className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted hover:text-transit-periwinkle transition-colors duration-150"
          >
            Collections
          </Link>
          <span className="text-transit-border" aria-hidden="true">/</span>
          <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
            Edit
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-black text-transit-periwinkle [font-family:var(--font-inter)]">
            {collection.title}
            <span className="text-transit-mint" aria-hidden="true">.</span>
          </h1>
          <CopyButton url={shareUrl} />
        </div>
        <p className="text-[10px] font-mono text-transit-muted mt-1">
          /c/{collection.slug}
        </p>
      </header>

      <div className="px-4 md:px-8 py-6 space-y-8">
        {/* ── Current stops ─────────────────────────────────────────────── */}
        <section aria-labelledby="stops-heading">
          <div className="flex items-center gap-2 mb-4">
            <p
              id="stops-heading"
              className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted"
            >
              Stops
            </p>
            <span className="flex-1 border-t border-transit-border/30" aria-hidden="true" />
            <span className="text-[9px] font-mono text-transit-muted">
              {memberLinks.length} {memberLinks.length === 1 ? "stop" : "stops"}
            </span>
          </div>

          {memberLinks.length === 0 ? (
            <div className="border border-transit-border/40 border-dashed rounded-lg py-10 text-center">
              <p className="text-transit-muted text-sm">No stops yet.</p>
              <p className="text-transit-muted/60 text-xs font-mono mt-1">
                Add links from your routes below.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical spine */}
              <div
                className="absolute left-[6px] top-4 bottom-4 w-[2px] rounded-full"
                style={{
                  background: "linear-gradient(to bottom, #c0caf5 0%, #7ee787 100%)",
                  opacity: 0.25,
                }}
                aria-hidden="true"
              />

              <ul className="space-y-0" aria-label="Collection stops">
                {memberLinks.map((link, idx) => (
                  <li
                    key={link.linkId}
                    className="relative flex items-center gap-4 py-3"
                    aria-label={`Stop ${idx + 1}: ${link.title ?? link.slug}`}
                  >
                    {/* Station dot */}
                    <div
                      className="relative z-10 w-3.5 h-3.5 rounded-full border-2 border-transit-periwinkle bg-transit-canvas flex-shrink-0 shadow-[0_0_4px_rgba(192,202,245,0.3)]"
                      aria-hidden="true"
                    />

                    {/* Stop label */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-transit-periwinkle truncate">
                        {link.title ?? link.slug}
                      </p>
                      <p className="text-[10px] font-mono text-transit-muted">
                        /v/{link.slug}
                      </p>
                    </div>

                    {/* Position badge */}
                    <span className="text-[9px] font-mono tracking-[0.2em] text-transit-muted flex-shrink-0">
                      {String(idx + 1).padStart(2, "0")}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Move up */}
                      {idx > 0 && (
                        <form action={moveLinkAction}>
                          <input type="hidden" name="collectionId" value={id} />
                          <input type="hidden" name="linkId" value={link.linkId} />
                          <input type="hidden" name="direction" value="up" />
                          <button
                            type="submit"
                            className="w-6 h-6 flex items-center justify-center text-transit-muted hover:text-transit-periwinkle border border-transit-border/50 hover:border-transit-periwinkle/50 rounded transition-all duration-150"
                            aria-label={`Move ${link.title ?? link.slug} up`}
                          >
                            ↑
                          </button>
                        </form>
                      )}
                      {/* Move down */}
                      {idx < memberLinks.length - 1 && (
                        <form action={moveLinkAction}>
                          <input type="hidden" name="collectionId" value={id} />
                          <input type="hidden" name="linkId" value={link.linkId} />
                          <input type="hidden" name="direction" value="down" />
                          <button
                            type="submit"
                            className="w-6 h-6 flex items-center justify-center text-transit-muted hover:text-transit-periwinkle border border-transit-border/50 hover:border-transit-periwinkle/50 rounded transition-all duration-150"
                            aria-label={`Move ${link.title ?? link.slug} down`}
                          >
                            ↓
                          </button>
                        </form>
                      )}
                      {/* Remove */}
                      <form action={removeLinkAction}>
                        <input type="hidden" name="collectionId" value={id} />
                        <input type="hidden" name="linkId" value={link.linkId} />
                        <button
                          type="submit"
                          className="w-6 h-6 flex items-center justify-center text-red-400/50 hover:text-red-400 border border-red-400/20 hover:border-red-400/50 rounded transition-all duration-150 text-xs"
                          aria-label={`Remove ${link.title ?? link.slug} from collection`}
                        >
                          ×
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ── Add a stop ────────────────────────────────────────────────── */}
        {candidateLinks.length > 0 && (
          <section aria-labelledby="add-stop-heading">
            <div className="flex items-center gap-2 mb-4">
              <p
                id="add-stop-heading"
                className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted"
              >
                Add Stop
              </p>
              <span className="flex-1 border-t border-transit-border/30" aria-hidden="true" />
            </div>

            <form action={addLinkAction} className="flex items-center gap-3">
              <input type="hidden" name="collectionId" value={id} />
              <select
                name="linkId"
                required
                className="flex-1 bg-transit-surface border border-transit-border rounded-lg px-3.5 py-2.5 text-sm text-transit-periwinkle focus:outline-none focus:border-transit-periwinkle/60 transition-colors duration-150"
                defaultValue=""
                aria-label="Select a link to add"
              >
                <option value="" disabled className="text-transit-muted">
                  Select a route to add...
                </option>
                {candidateLinks.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title ?? l.slug} (/v/{l.slug})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2.5 bg-transit-mint text-transit-canvas font-bold text-sm rounded-lg hover:bg-transit-mint/90 transition-colors duration-150"
              >
                <span aria-hidden="true">+</span>
                Add Stop
              </button>
            </form>
          </section>
        )}

        {/* All routes are already in the collection */}
        {candidateLinks.length === 0 && memberLinks.length > 0 && (
          <p className="text-[11px] font-mono text-transit-muted/60">
            All your routes are already in this collection.
          </p>
        )}
      </div>
    </div>
  );
}
