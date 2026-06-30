"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/transit/Button";
import { Field } from "@/components/transit/Field";

export type NotificationPrefs = {
  emailOnOpen: boolean;
  webhookUrl: string | null;
  emailConfigured: boolean;
};

// ── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  id,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id: string;
  label: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-transit-mint focus-visible:ring-offset-2 focus-visible:ring-offset-transit-canvas",
        checked
          ? "bg-transit-mint border-transit-mint"
          : "bg-transit-surface border-transit-border",
        disabled ? "opacity-40 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none block h-4 w-4 rounded-full bg-transit-canvas shadow ring-0 transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
        aria-hidden="true"
      />
    </button>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function NotificationPrefsPanel({ initialPrefs }: { initialPrefs: NotificationPrefs }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [emailOnOpen, setEmailOnOpen] = useState(initialPrefs.emailOnOpen);
  const [webhookUrl, setWebhookUrl] = useState(initialPrefs.webhookUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    emailOnOpen !== initialPrefs.emailOnOpen ||
    (webhookUrl || null) !== (initialPrefs.webhookUrl || null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailOnOpen, webhookUrl: webhookUrl.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to save preferences");
      }
      setSaved(true);
      startTransition(() => { router.refresh(); });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Email on open row */}
      <div className="border-b border-transit-border py-5 px-4 md:px-8 flex items-start justify-between hover:bg-white/[0.012] transition-colors duration-100 gap-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-transit-periwinkle">Email on open</p>
            {!initialPrefs.emailConfigured && (
              <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-transit-muted border border-transit-border rounded px-1.5 py-0.5">
                needs sender
              </span>
            )}
          </div>
          <p className="text-[11px] text-transit-muted font-mono mt-0.5">
            {initialPrefs.emailConfigured
              ? "Send you an email when a viewer opens a link for the first time."
              : "Requires SENTOU_RESEND_KEY + SENTOU_EMAIL_FROM to deliver."}
          </p>
        </div>
        <div className="flex-shrink-0 pt-0.5">
          <Toggle
            id="email-on-open"
            label="Email on open"
            checked={emailOnOpen}
            onChange={setEmailOnOpen}
            disabled={saving}
          />
        </div>
      </div>

      {/* Webhook URL row */}
      <div className="border-b border-transit-border py-5 px-4 md:px-8 hover:bg-white/[0.012] transition-colors duration-100">
        <div className="mb-3">
          <p className="text-sm font-medium text-transit-periwinkle mb-0.5">Webhook URL</p>
          <p className="text-[11px] text-transit-muted font-mono">
            Receive a POST request when a viewer opens a link for the first time. Leave blank to disable.
          </p>
        </div>
        <Field
          label="Endpoint (https://…)"
          placeholder="https://hooks.example.com/sentou-open"
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          disabled={saving}
        />
      </div>

      {/* Save row */}
      <div className="px-4 md:px-8 py-5 flex items-center justify-between border-b border-transit-border">
        <div>
          {saveError && (
            <p className="text-xs text-destructive" role="alert">{saveError}</p>
          )}
          {saved && !saveError && (
            <p className="text-xs text-transit-mint font-mono" role="status">Saved.</p>
          )}
        </div>
        <Button
          intent="primary"
          size="sm"
          disabled={saving || !dirty}
          onClick={handleSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
