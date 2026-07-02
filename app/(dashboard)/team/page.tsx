import { eq, asc } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { resolveRole, isAdmin } from "@/lib/auth-session";
import { listPendingInvitations, type TeamMember } from "@/lib/team";
import { TeamPanel } from "@/components/transit/TeamPanel";

export const dynamic = "force-dynamic";

// Types passed to the client panel — all Dates serialized to ISO strings.
export type { TeamMember, PendingInvitation } from "@/lib/team";

// ---------------------------------------------------------------------------
// TeamPage — server component; gates via session + resolves data
// ---------------------------------------------------------------------------

export default async function TeamPage() {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) redirect("/login");

  const db = getDb();

  // Resolve workspace org — oldest by createdAt, then id as tiebreaker
  const workspaceOrg = db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .orderBy(asc(schema.organization.createdAt), asc(schema.organization.id))
    .limit(1)
    .get();

  if (!workspaceOrg) redirect("/setup");

  // Actor role — server-resolved; client trusts this boolean, not its own session
  const actorRole = resolveRole(db, session.user.id);
  const actorIsAdmin = isAdmin({ userId: session.user.id, role: actorRole });

  // Members with user info (name + email)
  const rawMembers = db
    .select({
      memberId: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      joinedAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, workspaceOrg.id))
    .orderBy(asc(schema.member.createdAt))
    .all();

  // Pending invitations — ADMIN/OWNER ONLY. The invitation id is the acceptance token and
  // every prop reaches the client via the RSC payload, so non-admins must never receive one.
  const invitations = listPendingInvitations(db, workspaceOrg.id, actorIsAdmin);

  // Serialize Dates to ISO strings for client component boundary
  const members: TeamMember[] = rawMembers.map((m) => ({
    memberId: m.memberId,
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : String(m.joinedAt),
    name: m.name,
    email: m.email,
  }));

  return (
    <TeamPanel
      workspaceName={workspaceOrg.name}
      organizationId={workspaceOrg.id}
      members={members}
      invitations={invitations}
      actorUserId={session.user.id}
      actorIsAdmin={actorIsAdmin}
    />
  );
}
