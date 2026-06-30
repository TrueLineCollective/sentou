import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { resolveRole, isAdmin } from "@/lib/auth-session";
import { aggregate } from "@/lib/stats";
import type { ViewerStat } from "@/lib/stats";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────

type RouteStatus = "live" | "expired" | "revoked";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDwell(ms: number): string {
  if (ms <= 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function displayViewer(viewer: string, verifiedEmails: Set<string>): string {
  if (verifiedEmails.has(viewer)) return viewer;
  const prefix = viewer.replace(/[^a-z0-9]/gi, "").slice(0, 8) || viewer.slice(0, 8);
  return `anon-${prefix}`;
}

function getLinkStatus(link: {
  revoked: boolean;
  expiresAt: string | null;
}): RouteStatus {
  if (link.revoked) return "revoked";
  if (link.expiresAt !== null && new Date(link.expiresAt) < new Date())
    return "expired";
  return "live";
}

// ── Metric tile ────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-transit-surface border border-transit-border rounded-lg p-5 flex flex-col gap-1.5">
      <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
        {label}
      </span>
      <span className="text-3xl font-black text-transit-periwinkle [font-family:var(--font-inter)] tabular-nums leading-none">
        {value}
      </span>
      {sub && (
        <span className="text-[10px] font-mono text-transit-muted">{sub}</span>
      )}
    </div>
  );
}

// ── Journey visualization ─────────────────────────────────────────────────

function JourneyVisualization({
  title,
  viewers,
  verifiedEmails,
  status,
}: {
  title: string;
  viewers: ViewerStat[];
  verifiedEmails: Set<string>;
  status: RouteStatus;
}) {
  const spineGradient =
    status === "live"
      ? "linear-gradient(to bottom, #c0caf5, #7ee787)"
      : status === "revoked"
        ? "linear-gradient(to bottom, rgba(255,100,100,0.5), rgba(255,60,60,0.2))"
        : "#292e42";

  const destDotClass =
    status === "live"
      ? "border-transit-mint shadow-[0_0_8px_rgba(126,231,135,0.3)]"
      : status === "revoked"
        ? "border-red-400/60"
        : "border-transit-muted/40";

  return (
    <div className="relative pl-1">
      {/* Vertical spine */}
      <div
        className="absolute left-[7px] top-0 bottom-0 w-[2px] pointer-events-none"
        style={{ background: spineGradient }}
        aria-hidden="true"
      />

      {/* Origin — Workspace */}
      <div className="relative flex items-start gap-4 pb-7">
        <div
          className="relative z-10 w-[14px] h-[14px] flex-shrink-0 rounded-full border-2 border-transit-periwinkle bg-transit-canvas mt-0.5"
          style={{ boxShadow: "0 0 8px rgba(192,202,245,0.3)" }}
          aria-hidden="true"
        />
        <div className="pt-0.5">
          <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-periwinkle/60">
            Workspace
          </span>
          <p className="text-[8px] font-mono tracking-[0.2em] uppercase text-transit-muted mt-0.5">
            Origin
          </p>
        </div>
      </div>

      {/* Traveler stations */}
      {viewers.map((v, i) => {
        const display = displayViewer(v.viewer, verifiedEmails);
        const isVerified = verifiedEmails.has(v.viewer);
        const isLast = i === viewers.length - 1;

        return (
          <div
            key={v.viewer}
            className={`relative flex items-start gap-4 ${isLast ? "pb-7" : "pb-6"}`}
          >
            <div
              className="relative z-10 w-[14px] h-[14px] flex-shrink-0 rounded-full border-2 border-transit-periwinkle bg-transit-surface mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span
                  className={`text-sm font-medium truncate max-w-[240px] ${
                    isVerified
                      ? "text-transit-periwinkle"
                      : "text-transit-muted"
                  }`}
                >
                  {display}
                </span>
                {isVerified && (
                  <span className="text-[8px] font-mono tracking-[0.15em] uppercase text-transit-mint border border-transit-mint/30 rounded px-1.5 py-0.5 flex-shrink-0">
                    Verified
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-[10px] font-mono text-transit-muted">
                  <span className="text-transit-periwinkle/80">{v.opens}</span>
                  {" "}
                  {v.opens === 1 ? "open" : "opens"}
                </span>
                {v.totalDwellMs > 0 && (
                  <span className="text-[10px] font-mono text-transit-muted">
                    <span className="text-transit-periwinkle/80">
                      {fmtDwell(v.totalDwellMs)}
                    </span>
                    {" "}
                    dwell
                  </span>
                )}
                <span className="text-[10px] font-mono text-transit-muted">
                  {relativeTime(v.lastSeen)}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Destination — the link */}
      <div className="relative flex items-start gap-4">
        <div
          className={`relative z-10 w-[16px] h-[16px] flex-shrink-0 rounded-full border-2 bg-transit-canvas mt-0.5 ${destDotClass}`}
          aria-hidden="true"
        />
        <div className="pt-0.5">
          <span className="text-sm font-semibold text-transit-periwinkle">
            {title}
          </span>
          <p className="text-[8px] font-mono tracking-[0.2em] uppercase text-transit-muted mt-0.5">
            Destination
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Version timeline ───────────────────────────────────────────────────────

function VersionTimeline({
  versions,
}: {
  versions: Array<{ version: number; createdAt: string }>;
}) {
  if (versions.length === 0) {
    return (
      <p className="text-[10px] font-mono text-transit-muted">
        No versions recorded.
      </p>
    );
  }

  const maxVersion = Math.max(...versions.map((v) => v.version));

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-5">
        <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
          Version History
        </span>
      </div>

      <div className="flex flex-col gap-0">
        {versions.map((v, i) => {
          const isCurrent = v.version === maxVersion;
          const isLast = i === versions.length - 1;
          return (
            <div key={v.version} className="relative flex items-start gap-3">
              {/* Connector line */}
              {!isLast && (
                <div
                  className="absolute left-[6px] top-[14px] bottom-0 w-[2px]"
                  style={{ background: "#292e42" }}
                  aria-hidden="true"
                />
              )}
              {/* Dot */}
              <div
                className={`relative z-10 w-[14px] h-[14px] flex-shrink-0 rounded-full border-2 mt-0.5 ${
                  isCurrent
                    ? "bg-transit-canvas border-transit-mint shadow-[0_0_8px_rgba(126,231,135,0.5)]"
                    : "bg-transit-canvas border-transit-border/60"
                }`}
                aria-hidden="true"
              />
              {/* Info */}
              <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono tracking-[0.2em] uppercase font-semibold ${
                      isCurrent ? "text-transit-mint" : "text-transit-periwinkle/70"
                    }`}
                  >
                    v{v.version}
                  </span>
                  {isCurrent && (
                    <span className="text-[8px] font-mono tracking-[0.15em] uppercase text-transit-mint/70 border border-transit-mint/20 rounded px-1 py-0.5">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-[9px] font-mono text-transit-muted mt-0.5">
                  {shortDate(v.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Empty states ───────────────────────────────────────────────────────────

function TrackingOffState({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] px-8">
      <div className="w-72 mb-8" aria-hidden="true">
        <svg
          width="100%"
          height="56"
          viewBox="0 0 288 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="16"
            cy="28"
            r="8"
            fill="#1a1b26"
            stroke="#292e42"
            strokeWidth="2"
            strokeDasharray="3 2"
          />
          <line
            x1="24"
            y1="28"
            x2="264"
            y2="28"
            stroke="#292e42"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
          <circle
            cx="272"
            cy="28"
            r="8"
            fill="#1a1b26"
            stroke="#292e42"
            strokeWidth="2"
            strokeDasharray="3 2"
          />
        </svg>
      </div>
      <p className="text-transit-periwinkle font-black text-xl [font-family:var(--font-inter)] mb-2">
        Tracking is off.
      </p>
      <p className="text-transit-muted text-sm text-center max-w-xs leading-relaxed">
        No traveler data is collected for{" "}
        <span className="text-transit-periwinkle font-medium">{title}</span>.
        Enable tracking to see opens, dwell, and viewer insights.
      </p>
    </div>
  );
}

function NoTravelersState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8">
      <div className="w-64 mb-6" aria-hidden="true">
        <svg
          width="100%"
          height="48"
          viewBox="0 0 256 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="24"
            r="7"
            fill="#1a1b26"
            stroke="#c0caf5"
            strokeWidth="2"
          />
          <line
            x1="19"
            y1="24"
            x2="237"
            y2="24"
            stroke="#292e42"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
          <circle
            cx="244"
            cy="24"
            r="7"
            fill="#1a1b26"
            stroke="#292e42"
            strokeWidth="2"
            strokeDasharray="3 2"
          />
        </svg>
      </div>
      <p className="text-transit-periwinkle font-black text-lg [font-family:var(--font-inter)] mb-2">
        No travelers yet.
      </p>
      <p className="text-transit-muted text-sm text-center max-w-xs">
        Share the link. When someone opens it, their journey appears here.
      </p>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function LinkAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  // Layout redirects unauthenticated users; this is a safety guard.
  if (!session) return null;

  const db = getDb();
  const userId = session.user.id;
  const role = resolveRole(db, userId);
  const actor = { userId, role };

  // Fetch the link (synchronous .get() — better-sqlite3 is sync)
  const link = db
    .select()
    .from(schema.links)
    .where(eq(schema.links.id, id))
    .get();

  if (!link) notFound();

  // Ownership enforcement — mirrors the api/stats/route.ts pattern.
  // notFound() hides existence from unauthorized users.
  const authorized =
    (link.ownerUserId !== null && actor.userId === link.ownerUserId) ||
    isAdmin(actor);

  if (!authorized) notFound();

  const status = getLinkStatus(link);
  const title = link.title ?? link.slug;

  // Fetch events, verified viewers, and version rows
  const rawEvents = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.linkId, id))
    .all();

  const verifiedViewerRows = await db
    .select({ email: schema.viewers.email })
    .from(schema.viewers)
    .where(eq(schema.viewers.linkId, id))
    .all();

  const versionRows = await db
    .select({
      version: schema.versions.version,
      createdAt: schema.versions.createdAt,
    })
    .from(schema.versions)
    .where(eq(schema.versions.linkId, id))
    .orderBy(asc(schema.versions.version))
    .all();

  const verifiedEmails = new Set(verifiedViewerRows.map((v) => v.email));

  // Aggregate — sort by opens desc, then most-recent first
  const { totalOpens, viewers } = aggregate(rawEvents);
  const sortedViewers = [...viewers].sort(
    (a, b) => b.opens - a.opens || b.lastSeen.localeCompare(a.lastSeen),
  );

  const totalDwellMs = viewers.reduce((sum, v) => sum + v.totalDwellMs, 0);
  const avgDwellMs =
    viewers.length > 0 ? Math.round(totalDwellMs / viewers.length) : 0;
  const uniqueViewers = viewers.length;
  const verifiedCount = viewers.filter((v) =>
    verifiedEmails.has(v.viewer),
  ).length;

  // Status indicator styles
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
    <div className="min-h-dvh">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-transit-canvas/95 backdrop-blur-sm border-b border-transit-border px-8 py-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-3">
          <Link
            href="/"
            className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-muted hover:text-transit-periwinkle transition-colors duration-150"
          >
            ← Routes
          </Link>
          <span className="text-transit-border" aria-hidden="true">
            /
          </span>
          <span className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-muted">
            Analytics
          </span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted font-medium">
                {link.slug}
              </span>
              <span
                className="w-6 border-t border-transit-border/50"
                aria-hidden="true"
              />
              <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
                Analytics
              </span>
            </div>
            <h1 className="text-xl font-black text-transit-periwinkle [font-family:var(--font-inter)]">
              {title}
              <span className="text-transit-mint" aria-hidden="true">
                .
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`}
              aria-hidden="true"
            />
            <span
              className={`text-[9px] font-mono tracking-[0.28em] uppercase ${statusColor}`}
            >
              {status}
            </span>
          </div>
        </div>
      </header>

      {/* Body */}
      {!link.track ? (
        <TrackingOffState title={title} />
      ) : (
        <div className="px-8 py-8 space-y-10">
          {/* Signal — metric tiles */}
          <section aria-label="Summary metrics">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
                Signal
              </span>
              <span
                className="flex-1 border-t border-transit-border/50"
                aria-hidden="true"
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <MetricTile label="Total Opens" value={String(totalOpens)} sub="all-time" />
              <MetricTile
                label="Unique Travelers"
                value={String(uniqueViewers)}
                sub={verifiedCount > 0 ? `${verifiedCount} verified` : "none verified"}
              />
              <MetricTile
                label="Avg Dwell"
                value={fmtDwell(avgDwellMs)}
                sub="per traveler"
              />
              <MetricTile
                label="Total Dwell"
                value={fmtDwell(totalDwellMs)}
                sub="cumulative"
              />
            </div>
          </section>

          {/* Journey + versions */}
          {totalOpens === 0 ? (
            <NoTravelersState />
          ) : (
            <div className="grid grid-cols-[1fr_260px] gap-10 items-start">
              {/* Traveler map */}
              <section aria-label="Traveler journey">
                <div className="flex items-center gap-2.5 mb-6">
                  <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
                    Traveler Map
                  </span>
                  <span
                    className="flex-1 border-t border-transit-border/50"
                    aria-hidden="true"
                  />
                  <span className="text-[9px] font-mono text-transit-muted/50">
                    {uniqueViewers} {uniqueViewers === 1 ? "stop" : "stops"}
                  </span>
                </div>
                <JourneyVisualization
                  title={title}
                  viewers={sortedViewers}
                  verifiedEmails={verifiedEmails}
                  status={status}
                />
              </section>

              {/* Version sidebar */}
              <aside aria-label="Version history">
                <div className="bg-transit-surface border border-transit-border rounded-lg p-5 sticky top-[105px]">
                  <VersionTimeline versions={versionRows} />
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
