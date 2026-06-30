import Link from "next/link";
import { headers } from "next/headers";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { resolveRole, isAdmin } from "@/lib/auth-session";
import { RouteCardActions } from "@/components/transit/RouteCardActions";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────

type LinkRow = {
  id: string;
  slug: string;
  title: string | null;
  ownerUserId: string | null;
  revoked: boolean;
  expiresAt: string | null;
  track: boolean;
  createdAt: string;
  currentVersion: number;
};

type LinkWithStats = LinkRow & {
  totalOpens: number;
  lastOpened: string | null;
};

export type RouteStatus = "live" | "expired" | "revoked";

// ── Helpers ────────────────────────────────────────────────────────────────

function getLinkStatus(link: Pick<LinkWithStats, "revoked" | "expiresAt">): RouteStatus {
  if (link.revoked) return "revoked";
  if (link.expiresAt !== null && new Date(link.expiresAt) < new Date()) return "expired";
  return "live";
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ── Route entry — timetable row ────────────────────────────────────────────

function RouteEntry({
  link,
  index,
  viewerUrl,
}: {
  link: LinkWithStats;
  index: number;
  viewerUrl: string;
}) {
  const status = getLinkStatus(link);
  const lineNum = String(index + 1).padStart(2, "0");
  const title = link.title ?? link.slug;
  const version = link.currentVersion > 0 ? link.currentVersion : 1;

  // Route line visual style per status
  const routeLineStyle =
    status === "live"
      ? { background: "linear-gradient(to right, #c0caf5, #7ee787)" }
      : status === "revoked"
        ? { background: "linear-gradient(to right, rgba(255,100,100,0.35), rgba(255,60,60,0.35))" }
        : { background: "#292e42", opacity: 0.45 };

  const destDotBorder =
    status === "live"
      ? "border-transit-mint shadow-[0_0_8px_rgba(126,231,135,0.3)]"
      : status === "revoked"
        ? "border-red-400/50"
        : "border-transit-muted/25";

  const statusColor =
    status === "live"
      ? "text-transit-mint"
      : status === "revoked"
        ? "text-red-400"
        : "text-transit-muted";

  const statusDot =
    status === "live"
      ? "bg-transit-mint shadow-[0_0_6px_rgba(126,231,135,0.6)]"
      : status === "revoked"
        ? "bg-red-400"
        : "bg-transit-muted/40";

  return (
    <article
      className="border-b border-transit-border py-5 px-4 md:px-8 hover:bg-white/[0.012] transition-colors duration-100"
      aria-label={`Route ${lineNum}: ${title}`}
    >
      {/* Line ID + status indicator */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
          Line {lineNum}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`}
            aria-hidden="true"
          />
          <span className={`text-[9px] font-mono tracking-[0.28em] uppercase ${statusColor}`}>
            {status}
          </span>
        </div>
      </div>

      {/* Transit route line — full card width */}
      <div className="flex items-center mb-4" aria-hidden="true">
        {/* Origin station dot (periwinkle — the workspace) */}
        <div className="w-3 h-3 rounded-full border-2 border-transit-periwinkle bg-transit-canvas flex-shrink-0 z-10" />
        {/* Route line */}
        <div className="flex-1 h-[3px]" style={routeLineStyle} />
        {/* Destination station dot (status-colored — the link) */}
        <div
          className={`w-3.5 h-3.5 rounded-full border-2 bg-transit-canvas flex-shrink-0 z-10 ${destDotBorder}`}
        />
      </div>

      {/* Station labels + destination title */}
      <div className="flex items-start justify-between mb-3.5">
        <p className="text-[8px] font-mono tracking-[0.25em] uppercase text-transit-muted">
          Workspace
        </p>
        <p className="text-sm font-semibold text-transit-periwinkle text-right max-w-[55%] leading-snug">
          {title}
        </p>
      </div>

      {/* Stats + actions */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono text-transit-muted">
          <span className="text-transit-periwinkle/80">v{version}</span>
          {" · "}
          <span>{link.totalOpens} opens</span>
          {link.lastOpened && (
            <>
              {" · "}
              <span>{relativeTime(link.lastOpened)}</span>
            </>
          )}
        </p>
        <RouteCardActions
          linkId={link.id}
          slug={link.slug}
          viewerUrl={viewerUrl}
          status={status}
        />
      </div>
    </article>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyRoutes() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] px-4 md:px-8">
      {/* Dashed empty route line — signals the concept without filling it */}
      <div className="w-80 mb-8" aria-hidden="true">
        <svg
          width="100%"
          height="64"
          viewBox="0 0 320 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <text
            x="4"
            y="12"
            fontSize="8"
            fill="#828bbf"
            fontFamily="monospace"
            letterSpacing="3"
            textAnchor="start"
          >
            ORIGIN
          </text>
          <text
            x="316"
            y="12"
            fontSize="8"
            fill="#828bbf"
            fontFamily="monospace"
            letterSpacing="3"
            textAnchor="end"
          >
            DESTINATION
          </text>
          <circle
            cx="16"
            cy="40"
            r="9"
            fill="#1a1b26"
            stroke="#292e42"
            strokeWidth="2"
            strokeDasharray="3 2"
          />
          <line
            x1="25"
            y1="40"
            x2="295"
            y2="40"
            stroke="#292e42"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
          <circle
            cx="304"
            cy="40"
            r="9"
            fill="#1a1b26"
            stroke="#292e42"
            strokeWidth="2"
            strokeDasharray="3 2"
          />
        </svg>
      </div>

      <p className="text-transit-periwinkle font-black text-2xl [font-family:var(--font-inter)] mb-2">
        No lines yet.
      </p>
      <p className="text-transit-muted text-sm mb-8">
        Compose your first route and it appears here.
      </p>

      <Link
        href="/compose"
        className="flex items-center gap-2 px-5 py-2.5 bg-transit-mint text-transit-canvas font-bold text-sm rounded-lg hover:bg-transit-mint/90 transition-colors duration-150"
      >
        <span aria-hidden="true">+</span>
        New Route
      </Link>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function RoutesPage() {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  // Layout handles the unauthenticated redirect; this guards against edge cases.
  if (!session) return null;

  const db = getDb();
  const userId = session.user.id;
  const role = resolveRole(db, userId);
  const admin = isAdmin({ userId, role });

  // Query 1: links with their max published version (LEFT JOIN to handle 0-version links).
  // Single JOIN avoids the Cartesian product that arises from joining both versions
  // and events on the same query.
  const linksRaw = await db
    .select({
      id: schema.links.id,
      slug: schema.links.slug,
      title: schema.links.title,
      ownerUserId: schema.links.ownerUserId,
      revoked: schema.links.revoked,
      expiresAt: schema.links.expiresAt,
      track: schema.links.track,
      createdAt: schema.links.createdAt,
      currentVersion: sql<number>`COALESCE(MAX(${schema.versions.version}), 0)`,
    })
    .from(schema.links)
    .leftJoin(schema.versions, eq(schema.versions.linkId, schema.links.id))
    .where(admin ? undefined : eq(schema.links.ownerUserId, userId))
    .groupBy(schema.links.id)
    .orderBy(desc(schema.links.createdAt));

  // Query 2: event stats per link (separate to avoid COUNT(*) inflation).
  const eventStats = await db
    .select({
      linkId: schema.events.linkId,
      totalOpens: sql<number>`COUNT(*)`,
      lastOpened: sql<string | null>`MAX(${schema.events.openedAt})`,
    })
    .from(schema.events)
    .groupBy(schema.events.linkId);

  const statsMap = new Map(eventStats.map((e) => [e.linkId, e]));

  const links: LinkWithStats[] = linksRaw.map((link) => ({
    ...link,
    totalOpens: statsMap.get(link.id)?.totalOpens ?? 0,
    lastOpened: statsMap.get(link.id)?.lastOpened ?? null,
  }));

  const baseUrl =
    process.env.SENTOU_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    "";

  return (
    <div className="min-h-dvh">
      {/* Sticky header — always visible while scrolling */}
      <header className="sticky top-0 z-20 bg-transit-canvas/95 backdrop-blur-sm border-b border-transit-border px-4 md:px-8 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
              Line Network
            </span>
            <span
              className="w-8 border-t border-transit-border/50"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-xl font-black text-transit-periwinkle [font-family:var(--font-inter)]">
            Routes
            <span className="text-transit-mint" aria-hidden="true">
              .
            </span>
          </h1>
        </div>

        <Link
          href="/compose"
          className="flex items-center gap-2 px-4 py-2 bg-transit-mint text-transit-canvas font-bold text-sm rounded-lg hover:bg-transit-mint/90 transition-colors duration-150"
          aria-label="Compose a new route"
        >
          <span aria-hidden="true">+</span>
          New Route
        </Link>
      </header>

      {links.length === 0 ? (
        <EmptyRoutes />
      ) : (
        <div role="list" aria-label="Your routes">
          {links.map((link, i) => (
            <RouteEntry
              key={link.id}
              link={link}
              index={i}
              viewerUrl={`${baseUrl}/v/${link.slug}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
