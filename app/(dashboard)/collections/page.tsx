import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { resolveRole, isAdmin } from "@/lib/auth-session";
import { getCollectionsForUser } from "@/lib/collections";
import { CopyButton } from "@/components/transit/CopyButton";
import { CreateCollectionForm } from "./CreateCollectionForm";
import { deleteCollectionAction } from "./actions";

export const dynamic = "force-dynamic";

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyCollections() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] px-4 md:px-8">
      {/* Dashed empty line — signals bundling without filling it */}
      <div className="mb-8" aria-hidden="true">
        <svg width="280" height="72" viewBox="0 0 280 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <text x="4" y="12" fontSize="7" fill="#565f89" fontFamily="monospace" letterSpacing="3">ORIGIN</text>
          <text x="276" y="12" fontSize="7" fill="#565f89" fontFamily="monospace" letterSpacing="3" textAnchor="end">COLLECTION</text>
          {/* Three source dots */}
          <circle cx="16" cy="38" r="5" fill="#1a1b26" stroke="#292e42" strokeWidth="1.5" strokeDasharray="2 2" />
          <circle cx="16" cy="52" r="5" fill="#1a1b26" stroke="#292e42" strokeWidth="1.5" strokeDasharray="2 2" />
          <circle cx="16" cy="66" r="5" fill="#1a1b26" stroke="#292e42" strokeWidth="1.5" strokeDasharray="2 2" />
          {/* Converging lines */}
          <line x1="21" y1="38" x2="130" y2="52" stroke="#292e42" strokeWidth="1.5" strokeDasharray="6 5" />
          <line x1="21" y1="52" x2="130" y2="52" stroke="#292e42" strokeWidth="1.5" strokeDasharray="6 5" />
          <line x1="21" y1="66" x2="130" y2="52" stroke="#292e42" strokeWidth="1.5" strokeDasharray="6 5" />
          {/* Single line out */}
          <line x1="135" y1="52" x2="258" y2="52" stroke="#292e42" strokeWidth="1.5" strokeDasharray="6 5" />
          {/* Destination */}
          <circle cx="264" cy="52" r="8" fill="#1a1b26" stroke="#292e42" strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
      </div>

      <p className="text-transit-periwinkle font-black text-2xl [font-family:var(--font-inter)] mb-2">
        No collections yet.
      </p>
      <p className="text-transit-muted text-sm mb-8 text-center max-w-xs">
        Bundle your links into a single shareable collection route.
      </p>
    </div>
  );
}

// ── Collection card ───────────────────────────────────────────────────────────

function CollectionCard({
  id,
  slug,
  title,
  createdAt,
  linkCount,
  shareUrl,
}: {
  id: string;
  slug: string;
  title: string;
  createdAt: string;
  linkCount: number;
  shareUrl: string;
}) {
  return (
    <article
      className="border-b border-transit-border py-5 px-4 md:px-8 hover:bg-white/[0.012] transition-colors duration-100"
      aria-label={`Collection: ${title}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          {/* Monospace label */}
          <p className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted mb-1">
            Collection · /c/{slug}
          </p>
          {/* Title */}
          <h2 className="text-base font-bold text-transit-periwinkle leading-snug truncate">
            {title}
            <span className="text-transit-mint" aria-hidden="true">.</span>
          </h2>
        </div>

        {/* Station count badge */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-transit-mint shadow-[0_0_6px_rgba(126,231,135,0.5)]" aria-hidden="true" />
          <span className="text-[10px] font-mono text-transit-mint">
            {linkCount} {linkCount === 1 ? "stop" : "stops"}
          </span>
        </div>
      </div>

      {/* Route line visual */}
      <div className="flex items-center gap-0 mb-4" aria-hidden="true">
        <div className="w-2.5 h-2.5 rounded-full border-2 border-transit-periwinkle bg-transit-canvas flex-shrink-0" />
        <div
          className="flex-1 h-[2px]"
          style={{ background: "linear-gradient(to right, #c0caf5, #7ee787)" }}
        />
        <div className="w-3 h-3 rounded-full border-2 border-transit-mint bg-transit-canvas flex-shrink-0 shadow-[0_0_6px_rgba(126,231,135,0.4)]" />
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono text-transit-muted">
          {relativeTime(createdAt)}
        </p>

        <div className="flex items-center gap-2">
          <CopyButton url={shareUrl} />
          <Link
            href={`/collections/${id}`}
            className="px-2.5 py-1 text-[9px] font-mono tracking-[0.2em] uppercase border border-transit-border text-transit-muted hover:border-transit-periwinkle/50 hover:text-transit-periwinkle rounded transition-all duration-150"
          >
            Edit
          </Link>
          <form action={deleteCollectionAction}>
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="px-2.5 py-1 text-[9px] font-mono tracking-[0.2em] uppercase border border-red-400/30 text-red-400/70 hover:border-red-400/70 hover:text-red-400 rounded transition-all duration-150"
              aria-label={`Delete collection ${title}`}
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CollectionsPage() {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) return null;

  const db = getDb();
  const userId = session.user.id;
  const role = resolveRole(db, userId);
  const admin = isAdmin({ userId, role });

  const collections = getCollectionsForUser(db, userId, admin);

  const baseUrl =
    process.env.SENTOU_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    "";

  return (
    <div className="min-h-dvh">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-transit-canvas/95 backdrop-blur-sm border-b border-transit-border px-4 md:px-8 py-5">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
            Bundle Network
          </span>
          <span className="w-8 border-t border-transit-border/50" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-black text-transit-periwinkle [font-family:var(--font-inter)] mb-5">
          Collections
          <span className="text-transit-mint" aria-hidden="true">.</span>
        </h1>

        {/* Inline create form */}
        <CreateCollectionForm />
      </header>

      {/* List */}
      {collections.length === 0 ? (
        <EmptyCollections />
      ) : (
        <div role="list" aria-label="Your collections">
          {collections.map((c) => (
            <CollectionCard
              key={c.id}
              id={c.id}
              slug={c.slug}
              title={c.title}
              createdAt={c.createdAt}
              linkCount={c.linkCount ?? 0}
              shareUrl={`${baseUrl}/c/${c.slug}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
