import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { invitation as invitationTable, organization as orgTable } from "@/lib/db/auth-schema";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// InvalidInvite — shown when the token is missing, expired, or not found.
// Transit-styled: dashed route line signals an unresolved journey.
// ---------------------------------------------------------------------------
function InvalidInvite({ reason }: { reason: "missing" | "expired" | "invalid" }) {
  const messages: Record<typeof reason, { title: string; body: string }> = {
    missing: {
      title: "No token found.",
      body: "This link is missing an invitation token. Check the email you received.",
    },
    expired: {
      title: "Invitation expired.",
      body: "This invitation has passed its expiry date. Ask the workspace admin to send a new one.",
    },
    invalid: {
      title: "Invitation not found.",
      body: "This invitation does not exist or has already been used.",
    },
  };

  const { title, body } = messages[reason];

  return (
    <main className="transit-canvas flex min-h-screen flex-col items-center justify-center bg-transit-canvas text-transit-periwinkle px-8">
      {/* Blueprint grid */}
      <svg
        className="pointer-events-none fixed inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern id="egrid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#292e42" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#egrid)" />
      </svg>

      <div className="relative z-10 w-full max-w-sm text-center">
        {/* Dashed route line — unresolved journey */}
        <div className="w-full mb-8" aria-hidden="true">
          <svg
            width="100%"
            height="64"
            viewBox="0 0 320 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
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

        <p className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted mb-3">
          Line 01 · Unresolved
        </p>

        <h1
          className="text-3xl font-black leading-tight text-transit-periwinkle mb-3"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {title.replace(".", "")}.
        </h1>

        <p className="text-sm text-transit-muted leading-relaxed mb-8">{body}</p>

        <a
          href="/login"
          className="text-[10px] font-mono tracking-[0.25em] uppercase text-transit-mint hover:underline"
        >
          Back to login
        </a>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// AcceptInvitePage
// ---------------------------------------------------------------------------
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;

  if (!token) return <InvalidInvite reason="missing" />;

  // If the user already has an active session, send them home.
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (session) redirect("/");

  // Query the invitation directly from the DB — getInvitation requires a
  // session the user doesn't have yet.
  const db = getDb();
  const rows = await db
    .select({
      id: invitationTable.id,
      email: invitationTable.email,
      role: invitationTable.role,
      status: invitationTable.status,
      expiresAt: invitationTable.expiresAt,
      orgName: orgTable.name,
    })
    .from(invitationTable)
    .leftJoin(orgTable, eq(invitationTable.organizationId, orgTable.id))
    .where(eq(invitationTable.id, token))
    .limit(1);

  if (rows.length === 0) return <InvalidInvite reason="invalid" />;

  const row = rows[0];

  if (row.status !== "pending" || row.expiresAt < new Date()) {
    return <InvalidInvite reason="expired" />;
  }

  return (
    <AcceptInviteForm
      token={token}
      email={row.email}
      workspaceName={row.orgName ?? "Workspace"}
      role={row.role}
    />
  );
}
