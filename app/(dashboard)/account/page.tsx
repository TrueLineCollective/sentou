import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/transit/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) redirect("/login");

  const { name, email } = session.user;

  return (
    <div className="min-h-dvh">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-transit-canvas/95 backdrop-blur-sm border-b border-transit-border px-4 md:px-8 py-5">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
            Identity
          </span>
          <span className="w-8 border-t border-transit-border/50" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-black text-transit-periwinkle [font-family:var(--font-inter)]">
          Account
          <span className="text-transit-mint" aria-hidden="true">
            .
          </span>
        </h1>
      </header>

      {/* ── Profile section ───────────────────────────────────────────────── */}
      <section aria-labelledby="profile-heading">
        <div className="px-4 md:px-8 pt-8 pb-3">
          <p
            id="profile-heading"
            className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted"
          >
            Profile
          </p>
        </div>

        {/* Transit route line — workspace → this user */}
        <div className="px-4 md:px-8 pb-5">
          <div className="flex items-center gap-0" aria-hidden="true">
            <div className="w-3 h-3 rounded-full border-2 border-transit-muted/50 bg-transit-canvas flex-shrink-0" />
            <div
              className="flex-1 max-w-[120px] h-[2px]"
              style={{ background: "linear-gradient(to right, #828bbf, #c0caf5)" }}
            />
            <div className="w-3.5 h-3.5 rounded-full border-2 border-transit-periwinkle bg-transit-canvas flex-shrink-0 shadow-[0_0_8px_rgba(192,202,245,0.3)]" />
          </div>
        </div>

        {/* Name */}
        <div className="border-b border-transit-border py-5 px-4 md:px-8 flex items-center justify-between hover:bg-white/[0.012] transition-colors duration-100">
          <div>
            <p className="text-sm font-medium text-transit-periwinkle">Name</p>
            <p className="text-[11px] text-transit-muted mt-0.5 font-mono">display name</p>
          </div>
          <span className="text-sm text-transit-periwinkle/80 font-semibold">
            {name}
          </span>
        </div>

        {/* Email (read-only) */}
        <div className="border-b border-transit-border py-5 px-4 md:px-8 flex items-center justify-between hover:bg-white/[0.012] transition-colors duration-100">
          <div>
            <p className="text-sm font-medium text-transit-periwinkle">Email</p>
            <p className="text-[11px] text-transit-muted mt-0.5 font-mono">cannot be changed here</p>
          </div>
          <span className="text-sm font-mono text-transit-periwinkle/80">
            {email}
          </span>
        </div>
      </section>

      {/* ── Password section ──────────────────────────────────────────────── */}
      <section aria-labelledby="password-heading" className="mt-8">
        <div className="px-4 md:px-8 pb-4 border-b border-transit-border">
          <p
            id="password-heading"
            className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted"
          >
            Password
          </p>
        </div>

        <div className="px-4 md:px-8 py-8 max-w-md">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
