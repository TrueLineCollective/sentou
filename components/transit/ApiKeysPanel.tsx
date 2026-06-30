"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/transit/Button";
import { Field } from "@/components/transit/Field";

export type ApiKeyItem = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  enabled: boolean;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ── Key callout — shown once after minting ──────────────────────────────────

function KeyCallout({
  apiKey,
  onDismiss,
}: {
  apiKey: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div
      className="mx-8 mt-0 mb-0 border border-transit-mint/30 bg-transit-mint/[0.04] rounded-lg p-5"
      role="alert"
      aria-label="New API key, copy it now"
    >
      {/* Route line — signals "this key is live and departing" */}
      <div className="flex items-center gap-2 mb-3" aria-hidden="true">
        <div className="w-2 h-2 rounded-full border-2 border-transit-mint bg-transit-canvas flex-shrink-0" />
        <div className="flex-1 h-[2px]" style={{ background: "linear-gradient(to right, #7ee787, rgba(126,231,135,0.2))" }} />
        <div className="w-1.5 h-1.5 rounded-full bg-transit-mint/50 flex-shrink-0" />
      </div>

      <p className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-mint mb-2">
        Key minted, copy now
      </p>
      <p className="text-[11px] text-transit-muted mb-4">
        This is shown exactly once. Store it somewhere safe. It cannot be recovered.
      </p>

      <div className="flex items-center gap-3">
        <code className="flex-1 text-xs font-mono text-transit-periwinkle bg-transit-canvas/70 border border-transit-border rounded px-3 py-2.5 break-all select-all">
          {apiKey}
        </code>
        <Button
          intent="ghost"
          size="sm"
          onClick={handleCopy}
          className="flex-shrink-0 min-w-[72px]"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <button
        onClick={onDismiss}
        className="mt-4 text-[10px] font-mono tracking-[0.2em] uppercase text-transit-muted hover:text-transit-periwinkle transition-colors"
      >
        I have saved it, dismiss
      </button>
    </div>
  );
}

// ── Key row ─────────────────────────────────────────────────────────────────

function KeyRow({
  apiKey,
  index,
  onRevoke,
  revokeLoading,
}: {
  apiKey: ApiKeyItem;
  index: number;
  onRevoke: (id: string) => void;
  revokeLoading: string | null;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const lineNum = String(index + 1).padStart(2, "0");
  const isLoading = revokeLoading === apiKey.id;

  const lineBg = apiKey.enabled
    ? "linear-gradient(to right, #c0caf5, rgba(192,202,245,0.3))"
    : "linear-gradient(to right, rgba(255,100,100,0.25), rgba(255,60,60,0.1))";

  const dotClass = apiKey.enabled
    ? "border-transit-periwinkle/60"
    : "border-red-400/50";

  const statusColor = apiKey.enabled ? "text-transit-muted" : "text-red-400";
  const statusDot = apiKey.enabled ? "bg-transit-muted/50" : "bg-red-400";

  return (
    <article
      className="border-b border-transit-border py-5 px-4 md:px-8 hover:bg-white/[0.012] transition-colors duration-100"
      aria-label={`Key ${lineNum}: ${apiKey.name}`}
    >
      {/* Line ID + status */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
          Key {lineNum}
        </span>
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`} aria-hidden="true" />
          <span className={`text-[9px] font-mono tracking-[0.28em] uppercase ${statusColor}`}>
            {apiKey.enabled ? "active" : "revoked"}
          </span>
        </div>
      </div>

      {/* Transit route line */}
      <div className="flex items-center mb-4" aria-hidden="true">
        <div className="w-3 h-3 rounded-full border-2 border-transit-canvas flex-shrink-0 z-10" style={{ borderColor: "#828bbf" }} />
        <div className="flex-1 h-[3px]" style={{ background: lineBg }} />
        <div className={`w-3.5 h-3.5 rounded-full border-2 bg-transit-canvas flex-shrink-0 z-10 ${dotClass}`} />
      </div>

      {/* Key name + prefix */}
      <div className="flex items-start justify-between mb-3.5">
        <p className="text-[8px] font-mono tracking-[0.25em] uppercase text-transit-muted">
          {apiKey.prefix}…
        </p>
        <p className="text-sm font-semibold text-transit-periwinkle text-right max-w-[55%] leading-snug">
          {apiKey.name}
        </p>
      </div>

      {/* Meta + actions */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono text-transit-muted">
          <span>created {relativeTime(apiKey.createdAt)}</span>
          {apiKey.lastUsedAt && (
            <>
              {" · "}
              <span>used {relativeTime(apiKey.lastUsedAt)}</span>
            </>
          )}
          {!apiKey.lastUsedAt && apiKey.enabled && (
            <>
              {" · "}
              <span className="text-transit-muted/50">never used</span>
            </>
          )}
        </p>

        {apiKey.enabled && (
          confirmRevoke ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-transit-muted">Revoke?</span>
              <Button
                intent="destructive"
                size="sm"
                disabled={isLoading}
                onClick={() => { onRevoke(apiKey.id); setConfirmRevoke(false); }}
              >
                {isLoading ? "…" : "Yes"}
              </Button>
              <Button
                intent="ghost"
                size="sm"
                onClick={() => setConfirmRevoke(false)}
              >
                No
              </Button>
            </div>
          ) : (
            <Button
              intent="ghost"
              size="sm"
              onClick={() => setConfirmRevoke(true)}
            >
              Revoke
            </Button>
          )
        )}
      </div>
    </article>
  );
}

// ── Mint form ────────────────────────────────────────────────────────────────

function MintForm({
  onMinted,
  onCancel,
}: {
  onMinted: (key: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to create key");
      }
      const { key } = await res.json() as { key: string };
      onMinted(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 md:px-8 py-6 border-b border-transit-border bg-transit-elevated/30">
      <p className="text-[9px] font-mono tracking-[0.3em] uppercase text-transit-mint mb-4">
        New key
      </p>
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <Field
            label="Key name"
            placeholder="e.g. ci-deploy"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error ?? undefined}
            disabled={loading}
            autoFocus
          />
        </div>
        <div className="flex gap-2 pb-[1px]">
          <Button intent="primary" type="submit" disabled={loading || !name.trim()} size="sm">
            {loading ? "Minting…" : "Mint"}
          </Button>
          <Button intent="ghost" type="button" onClick={onCancel} size="sm" disabled={loading}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyKeys() {
  return (
    <div className="px-4 md:px-8 py-12 flex flex-col items-center">
      {/* Dashed line — no active routes */}
      <div className="w-64 mb-6" aria-hidden="true">
        <svg width="100%" height="40" viewBox="0 0 256 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="20" r="8" fill="#1a1b26" stroke="#292e42" strokeWidth="1.5" strokeDasharray="3 2" />
          <line x1="20" y1="20" x2="236" y2="20" stroke="#292e42" strokeWidth="1.5" strokeDasharray="6 5" />
          <circle cx="244" cy="20" r="8" fill="#1a1b26" stroke="#292e42" strokeWidth="1.5" strokeDasharray="3 2" />
        </svg>
      </div>
      <p className="text-transit-periwinkle font-semibold text-sm mb-1">No keys yet.</p>
      <p className="text-transit-muted text-xs">Mint your first API key above.</p>
    </div>
  );
}

// ── ApiKeysPanel (exported) ──────────────────────────────────────────────────

export function ApiKeysPanel({ initialKeys }: { initialKeys: ApiKeyItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mintOpen, setMintOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleMinted(key: string) {
    setRevealedKey(key);
    setMintOpen(false);
    // Refresh server component to populate the roster with the new key
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleRevoke(id: string) {
    setRevokeLoading(id);
    setError(null);
    try {
      const res = await fetch("/api/keys/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to revoke key");
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRevokeLoading(null);
    }
  }

  return (
    <div>
      {/* Mint button / header row */}
      <div className="px-4 md:px-8 py-5 flex items-center justify-between border-b border-transit-border">
        <p className="text-sm font-medium text-transit-periwinkle/80">
          {initialKeys.length === 0
            ? "No API keys"
            : `${initialKeys.filter(k => k.enabled).length} active · ${initialKeys.length} total`}
        </p>
        {!mintOpen && (
          <Button
            intent="primary"
            size="sm"
            onClick={() => { setMintOpen(true); setRevealedKey(null); setError(null); }}
          >
            <span aria-hidden="true" className="mr-1">+</span> Mint key
          </Button>
        )}
      </div>

      {/* Global error banner */}
      {error && (
        <div className="mx-8 mt-4 px-4 py-3 border border-red-400/30 bg-red-400/[0.04] rounded-lg text-sm text-red-400" role="alert">
          {error}
        </div>
      )}

      {/* Mint form */}
      {mintOpen && (
        <MintForm
          onMinted={handleMinted}
          onCancel={() => setMintOpen(false)}
        />
      )}

      {/* Revealed key callout */}
      {revealedKey && (
        <div className="border-b border-transit-border py-5">
          <KeyCallout apiKey={revealedKey} onDismiss={() => setRevealedKey(null)} />
        </div>
      )}

      {/* Key list */}
      {initialKeys.length === 0 && !mintOpen ? (
        <EmptyKeys />
      ) : (
        <div role="list" aria-label="Your API keys">
          {initialKeys.map((k, i) => (
            <KeyRow
              key={k.id}
              apiKey={k}
              index={i}
              onRevoke={handleRevoke}
              revokeLoading={revokeLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
