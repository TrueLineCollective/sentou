import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { emailConfigured } from "@/lib/email";
import { ApiKeysPanel, type ApiKeyItem } from "@/components/transit/ApiKeysPanel";
import { NotificationPrefsPanel, type NotificationPrefs } from "@/components/transit/NotificationPrefsPanel";

export const dynamic = "force-dynamic";

// ── Status badge (server-rendered) ──────────────────────────────────────────

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          ok
            ? "bg-transit-mint shadow-[0_0_6px_rgba(126,231,135,0.6)]"
            : "bg-red-400"
        }`}
        aria-hidden="true"
      />
      <span
        className={`text-[9px] font-mono tracking-[0.28em] uppercase ${
          ok ? "text-transit-mint" : "text-red-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) redirect("/login");

  const db = getDb();

  // Load this user's API keys ordered by creation date
  const rawKeys = db
    .select({
      id: schema.apiKey.id,
      name: schema.apiKey.name,
      prefix: schema.apiKey.prefix,
      createdAt: schema.apiKey.createdAt,
      lastUsedAt: schema.apiKey.lastUsedAt,
      enabled: schema.apiKey.enabled,
    })
    .from(schema.apiKey)
    .where(eq(schema.apiKey.userId, session.user.id))
    .orderBy(asc(schema.apiKey.createdAt))
    .all();

  const apiKeys: ApiKeyItem[] = rawKeys.map((k) => ({
    id: k.id,
    name: k.name ?? "Unnamed key",
    prefix: k.prefix,
    createdAt: k.createdAt instanceof Date ? k.createdAt.toISOString() : String(k.createdAt),
    lastUsedAt:
      k.lastUsedAt instanceof Date
        ? k.lastUsedAt.toISOString()
        : k.lastUsedAt
          ? String(k.lastUsedAt)
          : null,
    enabled: k.enabled,
  }));

  // Notification prefs for this user
  const rawPrefs = db
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, session.user.id))
    .get();

  const notifPrefs: NotificationPrefs = {
    emailOnOpen: rawPrefs?.emailOnOpen ?? false,
    webhookUrl: rawPrefs?.webhookUrl ?? null,
    emailConfigured: emailConfigured(),
  };

  // Config values — match the exact env resolution the engine uses
  const emailOk = emailConfigured();
  const retentionDays = process.env.SENTOU_RETENTION_DAYS;
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
            System
          </span>
          <span className="w-8 border-t border-transit-border/50" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-black text-transit-periwinkle [font-family:var(--font-inter)]">
          Settings
          <span className="text-transit-mint" aria-hidden="true">
            .
          </span>
        </h1>
      </header>

      {/* ── Config Status section ─────────────────────────────────────────── */}
      <section aria-labelledby="status-heading">
        <div className="px-4 md:px-8 pt-8 pb-3">
          <p
            id="status-heading"
            className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted"
          >
            Config Status
          </p>
        </div>

        {/* Email sender */}
        <div className="border-b border-transit-border py-5 px-4 md:px-8 flex items-center justify-between hover:bg-white/[0.012] transition-colors duration-100">
          <div>
            <p className="text-sm font-medium text-transit-periwinkle">Email sender</p>
            <p className="text-[11px] text-transit-muted mt-0.5 font-mono">
              SENTOU_RESEND_KEY + SENTOU_EMAIL_FROM
            </p>
          </div>
          <StatusBadge
            ok={emailOk}
            label={emailOk ? "configured" : "not configured"}
          />
        </div>

        {/* Viewer retention */}
        <div className="border-b border-transit-border py-5 px-4 md:px-8 flex items-center justify-between hover:bg-white/[0.012] transition-colors duration-100">
          <div>
            <p className="text-sm font-medium text-transit-periwinkle">Viewer retention</p>
            <p className="text-[11px] text-transit-muted mt-0.5 font-mono">
              SENTOU_RETENTION_DAYS
            </p>
          </div>
          <span className="text-sm font-mono text-transit-periwinkle/80">
            {retentionDays ? `${retentionDays} days` : "kept indefinitely"}
          </span>
        </div>

        {/* Base URL */}
        <div className="border-b border-transit-border py-5 px-4 md:px-8 flex items-start justify-between hover:bg-white/[0.012] transition-colors duration-100 gap-8">
          <div className="flex-shrink-0">
            <p className="text-sm font-medium text-transit-periwinkle">Base URL</p>
            <p className="text-[11px] text-transit-muted mt-0.5 font-mono">
              SENTOU_BASE_URL
            </p>
          </div>
          {baseUrl ? (
            <span className="text-sm font-mono text-transit-periwinkle/80 text-right break-all">
              {baseUrl}
            </span>
          ) : (
            <span className="text-sm font-mono text-transit-muted/50 italic">
              not set
            </span>
          )}
        </div>
      </section>

      {/* ── API Keys section ──────────────────────────────────────────────── */}
      <section aria-labelledby="keys-heading" className="mt-8">
        <div className="px-4 md:px-8 pb-4 border-b border-transit-border">
          <p
            id="keys-heading"
            className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted"
          >
            API Keys
          </p>
        </div>
        <ApiKeysPanel initialKeys={apiKeys} />
      </section>

      {/* ── Notifications section ─────────────────────────────────────────── */}
      <section aria-labelledby="notif-heading" className="mt-8">
        <div className="px-4 md:px-8 pb-4 border-b border-transit-border">
          <p
            id="notif-heading"
            className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted"
          >
            Notifications
          </p>
          <p className="text-[11px] text-transit-muted mt-1 font-mono">
            Alerts fire once per viewer, only on their first open of each link.
          </p>
        </div>
        <NotificationPrefsPanel initialPrefs={notifPrefs} />
      </section>
    </div>
  );
}
