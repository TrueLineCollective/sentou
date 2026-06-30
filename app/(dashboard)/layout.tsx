import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { Wordmark } from "@/components/transit/Wordmark";
import { NavRail } from "@/components/transit/NavRail";
import { SignOutButton } from "@/components/transit/SignOutButton";

export const dynamic = "force-dynamic";

// Blueprint grid — 48-px transit-map paper, same pattern as the setup screen.
function TransitGrid() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 w-full h-full z-0"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id="dgrid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#292e42" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dgrid)" />
    </svg>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });

  if (!session) {
    const db = getDb();
    const existing = await db.select({ id: userTable.id }).from(userTable).limit(1);
    redirect(existing.length === 0 ? "/setup" : "/login");
  }

  const { user } = session;

  return (
    <div className="transit-canvas flex min-h-dvh bg-transit-canvas text-transit-periwinkle">
      <TransitGrid />

      {/* Left nav rail */}
      <aside className="relative z-10 w-52 flex-shrink-0 flex flex-col border-r border-transit-border">
        {/* Wordmark */}
        <div className="px-5 pt-7 pb-5 border-b border-transit-border">
          <Wordmark size="md" />
          <p className="mt-1.5 text-[9px] font-mono tracking-[0.3em] uppercase text-transit-muted">
            Command
          </p>
        </div>

        {/* Route-spine navigation */}
        <NavRail />

        {/* User identity + sign-out */}
        <div className="px-5 py-4 border-t border-transit-border">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-transit-mint flex-shrink-0"
              aria-hidden="true"
            />
            <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-transit-mint">
              Active
            </span>
          </div>
          <p className="text-sm font-medium text-transit-periwinkle truncate">
            {user.name}
          </p>
          <p className="mt-0.5 text-[11px] text-transit-muted truncate">
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      {/* Main content area */}
      <main className="relative z-10 flex-1 min-h-dvh overflow-auto">
        {children}
      </main>
    </div>
  );
}
