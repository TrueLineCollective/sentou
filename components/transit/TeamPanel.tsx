"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/transit/Button";
import { Field } from "@/components/transit/Field";
import { cn } from "@/lib/utils";
import type { TeamMember, PendingInvitation } from "@/app/(dashboard)/team/page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function expiryLabel(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs < 0) return "expired";
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 24) return `expires in ${h}h`;
  const d = Math.floor(h / 24);
  return `expires in ${d}d`;
}

function roleDotClass(role: string): string {
  if (role === "owner")
    return "border-transit-mint shadow-[0_0_8px_rgba(126,231,135,0.4)]";
  if (role === "admin") return "border-transit-periwinkle";
  return "border-transit-muted/50";
}

function roleLineStyle(role: string): React.CSSProperties {
  if (role === "owner")
    return { background: "linear-gradient(to right, #c0caf5, #7ee787)" };
  if (role === "admin")
    return { background: "linear-gradient(to right, #292e42, #c0caf5)" };
  return { background: "#292e42", opacity: 0.5 };
}

function roleTextClass(role: string): string {
  if (role === "owner") return "text-transit-mint";
  if (role === "admin") return "text-transit-periwinkle";
  return "text-transit-muted";
}

// ---------------------------------------------------------------------------
// MemberRow
// ---------------------------------------------------------------------------

type MemberRowProps = {
  member: TeamMember;
  index: number;
  isActor: boolean;
  canRemove: boolean;
  confirmRemoveId: string | null;
  removingId: string | null;
  onConfirmRequest: (id: string) => void;
  onConfirmCancel: () => void;
  onRemove: (id: string) => void;
};

function MemberRow({
  member,
  index,
  isActor,
  canRemove,
  confirmRemoveId,
  removingId,
  onConfirmRequest,
  onConfirmCancel,
  onRemove,
}: MemberRowProps) {
  const lineNum = String(index + 1).padStart(2, "0");
  const isConfirming = confirmRemoveId === member.memberId;
  const isRemoving = removingId === member.memberId;

  return (
    <article
      className="border-b border-transit-border py-5 px-4 md:px-8 hover:bg-white/[0.012] transition-colors duration-100"
      aria-label={`Station ${lineNum}: ${member.name}`}
    >
      {/* Line ID + role */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
          Station {lineNum}
          {isActor && (
            <span className="ml-2 text-transit-periwinkle/60">(you)</span>
          )}
        </span>
        <span
          className={cn(
            "text-[9px] font-mono tracking-[0.28em] uppercase",
            roleTextClass(member.role),
          )}
        >
          {member.role}
        </span>
      </div>

      {/* Transit route line */}
      <div className="flex items-center mb-4" aria-hidden="true">
        <div className="w-3 h-3 rounded-full border-2 border-transit-periwinkle bg-transit-canvas flex-shrink-0 z-10" />
        <div className="flex-1 h-[3px]" style={roleLineStyle(member.role)} />
        <div
          className={cn(
            "w-3.5 h-3.5 rounded-full border-2 bg-transit-canvas flex-shrink-0 z-10",
            roleDotClass(member.role),
          )}
        />
      </div>

      {/* Member info + actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-transit-periwinkle truncate">
            {member.name}
          </p>
          <p className="text-[11px] text-transit-muted mt-0.5 truncate">
            {member.email}
          </p>
          <p className="text-[9px] font-mono tracking-[0.2em] uppercase text-transit-muted/60 mt-1">
            joined {relativeDate(member.joinedAt)}
          </p>
        </div>

        {canRemove && !isActor && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isConfirming ? (
              <>
                <span className="text-[10px] font-mono text-transit-muted mr-1">
                  Remove?
                </span>
                <Button
                  intent="ghost"
                  size="sm"
                  onClick={onConfirmCancel}
                  className="h-7 px-3 text-[10px]"
                >
                  Cancel
                </Button>
                <Button
                  intent="destructive"
                  size="sm"
                  disabled={isRemoving}
                  onClick={() => onRemove(member.memberId)}
                  className="h-7 px-3 text-[10px]"
                >
                  {isRemoving ? "Removing..." : "Confirm"}
                </Button>
              </>
            ) : (
              <Button
                intent="ghost"
                size="sm"
                disabled={isRemoving}
                onClick={() => onConfirmRequest(member.memberId)}
                className="h-7 px-3 text-[10px] text-transit-muted hover:text-red-400 hover:border-red-400/30 transition-colors"
              >
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// InvitationRow
// ---------------------------------------------------------------------------

type InvitationRowProps = {
  invitation: PendingInvitation;
  index: number;
  canCancel: boolean;
  cancellingId: string | null;
  onCancel: (id: string) => void;
};

function InvitationRow({
  invitation,
  index,
  canCancel,
  cancellingId,
  onCancel,
}: InvitationRowProps) {
  const lineNum = String(index + 1).padStart(2, "0");
  const isCancelling = cancellingId === invitation.id;

  return (
    <article
      className="border-b border-transit-border py-5 px-4 md:px-8 hover:bg-white/[0.012] transition-colors duration-100"
      aria-label={`Pending invitation ${lineNum} for ${invitation.email}`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
          Invite {lineNum}
        </span>
        <span className="text-[9px] font-mono tracking-[0.28em] uppercase text-transit-muted/60">
          {expiryLabel(invitation.expiresAt)}
        </span>
      </div>

      {/* Dashed route line = unresolved journey */}
      <div className="flex items-center mb-4" aria-hidden="true">
        <div className="w-3 h-3 rounded-full border-2 border-dashed border-transit-periwinkle/40 bg-transit-canvas flex-shrink-0 z-10" />
        <div
          className="flex-1 h-[2px]"
          style={{
            background: "repeating-linear-gradient(to right, #292e42 0, #292e42 8px, transparent 8px, transparent 16px)",
          }}
        />
        <div className="w-3 h-3 rounded-full border-2 border-dashed border-transit-muted/30 bg-transit-canvas flex-shrink-0 z-10" />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-transit-periwinkle/80 truncate">
            {invitation.email}
          </p>
          <p className="text-[9px] font-mono tracking-[0.2em] uppercase text-transit-muted/60 mt-1">
            {invitation.role} / invited by {invitation.inviterName} / {relativeDate(invitation.createdAt)}
          </p>
        </div>

        {canCancel && (
          <Button
            intent="ghost"
            size="sm"
            disabled={isCancelling}
            onClick={() => onCancel(invitation.id)}
            className="h-7 px-3 text-[10px] text-transit-muted hover:text-red-400 hover:border-red-400/30 transition-colors flex-shrink-0"
          >
            {isCancelling ? "Cancelling..." : "Cancel"}
          </Button>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Empty invitations state
// ---------------------------------------------------------------------------

function EmptyInvitations() {
  return (
    <div className="px-4 md:px-8 py-10 flex flex-col items-center text-center">
      {/* Dashed route: the destination is not yet reached */}
      <svg
        width="100%"
        height="48"
        viewBox="0 0 400 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="max-w-xs mb-6"
      >
        <circle cx="16" cy="24" r="7" fill="#1a1b26" stroke="#292e42" strokeWidth="2" strokeDasharray="3 2" />
        <line x1="23" y1="24" x2="377" y2="24" stroke="#292e42" strokeWidth="2" strokeDasharray="8 6" />
        <circle cx="384" cy="24" r="7" fill="#1a1b26" stroke="#292e42" strokeWidth="2" strokeDasharray="3 2" />
      </svg>
      <p className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted mb-2">
        No pending invitations
      </p>
      <p className="text-xs text-transit-muted/60">
        Invite a collaborator to add them to this line.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InviteForm
// ---------------------------------------------------------------------------

type InviteFormProps = {
  organizationId: string;
  onSuccess: (acceptUrl: string) => void;
};

function InviteForm({ organizationId, onSuccess }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Lowercase + trim so the invite matches auth.ts's eq(invitation.email, user.email.toLowerCase()) gate.
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.organization.inviteMember({
        email: trimmed,
        role,
        organizationId,
      });
      if (res.error) {
        setError(res.error.message ?? "Could not send invitation.");
        return;
      }
      const acceptUrl = res.data?.id
        ? `${window.location.origin}/accept-invite?token=${res.data.id}`
        : null;
      setEmail("");
      setRole("member");
      router.refresh();
      if (acceptUrl) onSuccess(acceptUrl);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="invite-heading" className="px-4 md:px-8 py-6 border-t border-transit-border">
      <p
        id="invite-heading"
        className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted mb-5"
      >
        Add to line
      </p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 max-w-md">
        <Field
          label="Email address"
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="invite-role"
            className="text-sm font-medium text-transit-periwinkle"
          >
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "member" | "admin")}
            className={cn(
              "h-11 px-3 rounded-md border text-sm",
              "bg-transit-surface border-transit-border text-transit-periwinkle",
              "focus:outline-none focus:ring-2 focus:ring-transit-mint focus:border-transit-mint",
              "transition-colors duration-150",
            )}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm font-mono bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 text-red-400"
          >
            {error}
          </p>
        )}

        <Button
          intent="primary"
          type="submit"
          disabled={loading || !email.trim()}
          className="h-10 w-full sm:w-auto"
        >
          {loading ? "Sending..." : "Send invitation"}
        </Button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TeamPanel — main export
// ---------------------------------------------------------------------------

type TeamPanelProps = {
  workspaceName: string;
  organizationId: string;
  members: TeamMember[];
  invitations: PendingInvitation[];
  actorUserId: string;
  actorIsAdmin: boolean;
};

export function TeamPanel({
  workspaceName,
  organizationId,
  members,
  invitations,
  actorUserId,
  actorIsAdmin,
}: TeamPanelProps) {
  const router = useRouter();
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteSuccessUrl, setInviteSuccessUrl] = useState<string | null>(null);

  async function handleRemove(memberId: string) {
    setActionError(null);
    setRemovingId(memberId);
    setConfirmRemoveId(null);
    try {
      const res = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId,
      });
      if (res.error) {
        setActionError(res.error.message ?? "Could not remove member.");
        return;
      }
      router.refresh();
    } catch {
      setActionError("Something went wrong removing the member.");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCancelInvite(invitationId: string) {
    setActionError(null);
    setCancellingId(invitationId);
    try {
      const res = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (res.error) {
        setActionError(res.error.message ?? "Could not cancel invitation.");
        return;
      }
      router.refresh();
    } catch {
      setActionError("Something went wrong cancelling the invitation.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-transit-canvas/95 backdrop-blur-sm border-b border-transit-border px-4 md:px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted mb-1">
              {workspaceName}
            </p>
            <h1
              className="text-xl font-black text-transit-periwinkle leading-none"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Team<span className="text-transit-mint">.</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono tracking-[0.28em] uppercase text-transit-muted">
              {members.length} on line
            </span>
            {invitations.length > 0 && (
              <span className="text-[9px] font-mono tracking-[0.28em] uppercase text-transit-muted">
                / {invitations.length} pending
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Action error banner */}
      {actionError && (
        <div
          role="alert"
          className="mx-4 md:mx-8 mt-4 text-sm font-mono bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 text-red-400"
        >
          {actionError}
          <button
            onClick={() => setActionError(null)}
            className="ml-3 text-red-400/60 hover:text-red-400 transition-colors"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Invite success banner */}
      {inviteSuccessUrl && (
        <div className="mx-4 md:mx-8 mt-4 bg-transit-mint/10 border border-transit-mint/30 rounded-lg px-4 py-3">
          <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-transit-mint mb-1">
            Invitation sent
          </p>
          <p className="text-xs text-transit-muted mb-2">
            Accept link (displayed here because no email is configured in this environment):
          </p>
          <a
            href={inviteSuccessUrl}
            className="text-xs font-mono text-transit-periwinkle hover:text-transit-mint break-all transition-colors"
          >
            {inviteSuccessUrl}
          </a>
          <button
            onClick={() => setInviteSuccessUrl(null)}
            className="block mt-2 text-[10px] font-mono text-transit-muted/60 hover:text-transit-muted transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Members section */}
      <section aria-label="Team members">
        <div className="px-4 md:px-8 pt-6 pb-2">
          <p className="text-[8px] font-mono tracking-[0.35em] uppercase text-transit-muted">
            Members
          </p>
        </div>

        {members.map((member, i) => (
          <MemberRow
            key={member.memberId}
            member={member}
            index={i}
            isActor={member.userId === actorUserId}
            canRemove={actorIsAdmin && member.role !== "owner"}
            confirmRemoveId={confirmRemoveId}
            removingId={removingId}
            onConfirmRequest={(id) => {
              setActionError(null);
              setConfirmRemoveId(id);
            }}
            onConfirmCancel={() => setConfirmRemoveId(null)}
            onRemove={handleRemove}
          />
        ))}
      </section>

      {/* Pending invitations section */}
      <section aria-label="Pending invitations" className="mt-2">
        <div className="px-4 md:px-8 pt-4 pb-2">
          <p className="text-[8px] font-mono tracking-[0.35em] uppercase text-transit-muted">
            Pending invitations
          </p>
        </div>

        {invitations.length === 0 ? (
          <EmptyInvitations />
        ) : (
          invitations.map((invite, i) => (
            <InvitationRow
              key={invite.id}
              invitation={invite}
              index={i}
              canCancel={actorIsAdmin}
              cancellingId={cancellingId}
              onCancel={handleCancelInvite}
            />
          ))
        )}
      </section>

      {/* Invite form (admin/owner only) */}
      {actorIsAdmin && (
        <InviteForm
          organizationId={organizationId}
          onSuccess={(url) => setInviteSuccessUrl(url)}
        />
      )}

      {/* Member-only view: read-only footer note */}
      {!actorIsAdmin && (
        <div className="px-4 md:px-8 py-6 border-t border-transit-border mt-auto">
          <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-transit-muted/50">
            Contact an admin to invite or remove members.
          </p>
        </div>
      )}
    </div>
  );
}
