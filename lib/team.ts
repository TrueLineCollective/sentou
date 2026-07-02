import { eq, and, asc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

// DTOs serialized across the Team page's server→client boundary. Dates are ISO strings.
export type TeamMember = {
  memberId: string;
  userId: string;
  role: string;
  joinedAt: string;
  name: string;
  email: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  inviterName: string;
};

function iso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

// Pending invitations for the workspace org — ADMIN/OWNER ONLY.
//
// An invitation's `id` IS its acceptance token: app/accept-invite resolves the invite via
// eq(invitation.id, token). Every value returned here is passed as a prop to the client
// <TeamPanel>, and Next serializes all client-component props into the page's RSC payload, so it
// reaches the browser of anyone who can load /team. Returning these to a non-admin would hand a
// usable invite token (including for an admin-role invite) to any authenticated member, who could
// then accept a pending seat and escalate. Non-admins get an empty list and never receive a token.
export function listPendingInvitations(
  db: BetterSQLite3Database<typeof schema>,
  organizationId: string,
  actorIsAdmin: boolean,
): PendingInvitation[] {
  if (!actorIsAdmin) return [];
  const rows = db
    .select({
      id: schema.invitation.id,
      email: schema.invitation.email,
      role: schema.invitation.role,
      expiresAt: schema.invitation.expiresAt,
      createdAt: schema.invitation.createdAt,
      inviterName: schema.user.name,
    })
    .from(schema.invitation)
    .innerJoin(schema.user, eq(schema.invitation.inviterId, schema.user.id))
    .where(
      and(
        eq(schema.invitation.organizationId, organizationId),
        eq(schema.invitation.status, "pending"),
      ),
    )
    .orderBy(asc(schema.invitation.createdAt))
    .all();

  return rows.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role ?? "member",
    expiresAt: iso(i.expiresAt),
    createdAt: iso(i.createdAt),
    inviterName: i.inviterName,
  }));
}
