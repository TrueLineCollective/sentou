"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { publishAction } from "@/app/(dashboard)/compose/actions";
import { INITIAL_STATE } from "@/app/(dashboard)/compose/state";

const PREVIEW_DEBOUNCE_MS = 300;

// ── ComposeForm ────────────────────────────────────────────────────────────

export function ComposeForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(publishAction, INITIAL_STATE);

  // Live preview — debounced so fast typing doesn't thrash the iframe
  const [previewHtml, setPreviewHtml] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect to Routes home when a slug comes back (success path)
  useEffect(() => {
    if (state.slug) {
      router.push("/");
    }
  }, [state.slug, router]);

  function handleHtmlChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPreviewHtml(val), PREVIEW_DEBOUNCE_MS);
  }

  // Clean up pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="min-h-dvh">
      {/* ── Sticky page header ── */}
      <header className="sticky top-0 z-20 bg-transit-canvas/95 backdrop-blur-sm border-b border-transit-border px-8 py-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
              Line Composer
            </span>
            <span className="w-8 border-t border-transit-border/50" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-black text-transit-periwinkle [font-family:var(--font-inter)]">
            Compose
            <span className="text-transit-mint" aria-hidden="true">.</span>
          </h1>
        </div>

        <Link
          href="/"
          className="px-4 py-2 text-[9px] font-mono tracking-[0.2em] uppercase text-transit-muted hover:text-transit-periwinkle border border-transit-border/50 hover:border-transit-border rounded transition-colors duration-150"
        >
          Cancel
        </Link>
      </header>

      {/* ── Error banner ── */}
      {state.error && (
        <div role="alert" aria-live="assertive" className="px-8 pt-5">
          <p className="text-red-400 text-sm font-mono bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3">
            {state.error}
          </p>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <form action={formAction} noValidate>
        <div className="grid grid-cols-1 xl:grid-cols-2">
          {/* ── LEFT: form ── */}
          <div className="border-r border-transit-border p-8 flex flex-col gap-7">

            {/* Route identity */}
            <section aria-labelledby="lbl-identity">
              <SectionDivider id="lbl-identity" label="Route Identity" />

              {/* Title */}
              <div className="mb-4">
                <label
                  htmlFor="title"
                  className="block text-[10px] font-mono tracking-[0.2em] uppercase text-transit-muted mb-1.5"
                >
                  Title
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  placeholder="My route"
                  className="w-full bg-transit-surface border border-transit-border text-transit-periwinkle text-sm rounded-lg px-3.5 py-2.5 placeholder:text-transit-muted/50 focus:outline-none focus:ring-1 focus:ring-transit-mint focus:border-transit-mint transition-colors duration-150"
                  autoComplete="off"
                  aria-describedby="title-hint"
                />
                <p id="title-hint" className="mt-1 text-[10px] text-transit-muted font-mono">
                  Optional. Displayed on the Routes board.
                </p>
              </div>

              {/* HTML payload */}
              <div>
                <label
                  htmlFor="html"
                  className="block text-[10px] font-mono tracking-[0.2em] uppercase text-transit-muted mb-1.5"
                >
                  HTML Payload{" "}
                  <span className="text-transit-mint" aria-label="required">
                    *
                  </span>
                </label>
                <textarea
                  id="html"
                  name="html"
                  rows={14}
                  onChange={handleHtmlChange}
                  placeholder={"<!DOCTYPE html>\n<html>\n  <body>\n    <h1>Hello</h1>\n  </body>\n</html>"}
                  required
                  aria-required="true"
                  aria-describedby="html-hint"
                  className="w-full font-mono text-xs bg-transit-surface border border-transit-border text-transit-periwinkle rounded-lg px-3.5 py-3 placeholder:text-transit-muted/40 focus:outline-none focus:ring-1 focus:ring-transit-mint focus:border-transit-mint transition-colors duration-150 resize-y"
                />
                <p id="html-hint" className="mt-1 text-[10px] text-transit-muted font-mono">
                  Full HTML document served to recipients. Scripts are allowed; same-origin access is blocked.
                </p>
              </div>
            </section>

            {/* Gate configuration */}
            <section aria-labelledby="lbl-gate">
              {/* Station-dot divider matching Route card DNA */}
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-2 h-2 rounded-full border-2 border-transit-periwinkle/60 bg-transit-canvas flex-shrink-0"
                  aria-hidden="true"
                />
                <div
                  className="w-5 border-t-2 border-transit-periwinkle/20"
                  aria-hidden="true"
                />
                <span
                  id="lbl-gate"
                  className="text-[8px] font-mono tracking-[0.35em] uppercase text-transit-muted"
                >
                  Gate Configuration
                </span>
                <div className="flex-1 border-t border-transit-border/40" aria-hidden="true" />
              </div>

              <div className="flex flex-col gap-5">
                <ToggleRow
                  id="requireEmail"
                  name="requireEmail"
                  label="Require Email"
                  hint="Recipients must submit their email address to access the route."
                />

                {/* Allowed domains */}
                <div>
                  <label
                    htmlFor="allowedDomains"
                    className="block text-[10px] font-mono tracking-[0.2em] uppercase text-transit-muted mb-1.5"
                  >
                    Allowed Domains
                  </label>
                  <input
                    id="allowedDomains"
                    name="allowedDomains"
                    type="text"
                    placeholder="acme.com, example.org"
                    aria-describedby="domains-hint"
                    className="w-full bg-transit-surface border border-transit-border text-transit-periwinkle text-sm rounded-lg px-3.5 py-2.5 placeholder:text-transit-muted/50 focus:outline-none focus:ring-1 focus:ring-transit-mint focus:border-transit-mint transition-colors duration-150"
                    autoComplete="off"
                  />
                  <p id="domains-hint" className="mt-1 text-[10px] text-transit-muted font-mono">
                    Comma-separated. Restricts the email gate to these domains. Leave empty for any.
                  </p>
                </div>

                {/* Expiry date */}
                <div>
                  <label
                    htmlFor="expiresAt"
                    className="block text-[10px] font-mono tracking-[0.2em] uppercase text-transit-muted mb-1.5"
                  >
                    Expiry Date
                  </label>
                  <input
                    id="expiresAt"
                    name="expiresAt"
                    type="datetime-local"
                    aria-describedby="expiry-hint"
                    className="w-full bg-transit-surface border border-transit-border text-transit-periwinkle text-sm rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-transit-mint focus:border-transit-mint transition-colors duration-150 [color-scheme:dark]"
                  />
                  <p id="expiry-hint" className="mt-1 text-[10px] text-transit-muted font-mono">
                    Optional. Route becomes inaccessible after this date.
                  </p>
                </div>

                <ToggleRow
                  id="verifyEmail"
                  name="verifyEmail"
                  label="Verify Email"
                  hint="Send a one-time code to verify the recipient's email address."
                />

                <ToggleRow
                  id="track"
                  name="track"
                  label="Track Opens"
                  hint="Record each open event for analytics."
                />
              </div>
            </section>

            {/* Submit */}
            <div className="pt-2">
              {/* Route line visual before the dispatch button */}
              <div className="flex items-center mb-5" aria-hidden="true">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-transit-periwinkle bg-transit-canvas flex-shrink-0" />
                <div
                  className="flex-1 h-[2px]"
                  style={{ background: "linear-gradient(to right, #c0caf5, #7ee787)" }}
                />
                <div className="w-3 h-3 rounded-full border-2 border-transit-mint bg-transit-canvas flex-shrink-0 shadow-[0_0_8px_rgba(126,231,135,0.3)]" />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full py-3 bg-transit-mint text-transit-canvas font-bold text-sm rounded-lg hover:bg-transit-mint/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 [font-family:var(--font-inter)]"
              >
                {pending ? "Dispatching..." : "Dispatch Route"}
              </button>
            </div>
          </div>

          {/* ── RIGHT: live preview ── */}
          <div className="flex flex-col xl:sticky xl:top-0 xl:h-dvh xl:overflow-hidden">
            {/* Preview header */}
            <div className="px-8 pt-7 pb-4 border-b border-transit-border flex items-center gap-3">
              <span className="text-[9px] font-mono tracking-[0.35em] uppercase text-transit-muted">
                Live Preview
              </span>
              <span className="w-5 border-t border-transit-border/50" aria-hidden="true" />
              <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-transit-mint/70">
                Sandboxed
              </span>
            </div>

            {/* Preview area */}
            <div className="flex-1 p-6 min-h-[500px] xl:min-h-0">
              {previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  sandbox="allow-scripts"
                  title="Sandboxed preview of the HTML payload"
                  className="w-full h-full rounded-lg border border-transit-border bg-white"
                  aria-label="Sandboxed live preview. Scripts are allowed; same-origin access is blocked."
                />
              ) : (
                <EmptyPreview />
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── EmptyPreview ───────────────────────────────────────────────────────────

function EmptyPreview() {
  return (
    <div className="w-full h-full min-h-[400px] rounded-lg border border-transit-border/40 border-dashed flex flex-col items-center justify-center gap-4">
      <svg
        width="200"
        height="44"
        viewBox="0 0 200 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="22"
          r="9"
          fill="#1a1b26"
          stroke="#292e42"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />
        <line
          x1="21"
          y1="22"
          x2="179"
          y2="22"
          stroke="#292e42"
          strokeWidth="1.5"
          strokeDasharray="9 6"
        />
        <circle
          cx="188"
          cy="22"
          r="9"
          fill="#1a1b26"
          stroke="#292e42"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />
      </svg>
      <div className="text-center">
        <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-transit-muted/60">
          No content yet
        </p>
        <p className="mt-1 text-[10px] text-transit-muted/40 font-mono max-w-[200px] mx-auto leading-relaxed">
          Paste HTML in the payload field to see a live preview.
        </p>
      </div>
    </div>
  );
}

// ── SectionDivider ─────────────────────────────────────────────────────────

function SectionDivider({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span
        id={id}
        className="text-[8px] font-mono tracking-[0.35em] uppercase text-transit-muted"
      >
        {label}
      </span>
      <div className="flex-1 border-t border-transit-border/40" aria-hidden="true" />
    </div>
  );
}

// ── ToggleRow ──────────────────────────────────────────────────────────────

function ToggleRow({
  id,
  name,
  label,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="flex items-start gap-3">
      {/* Visual toggle button */}
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={`${id}-hint`}
        onClick={() => setChecked((v) => !v)}
        className={[
          "relative flex-shrink-0 mt-0.5 w-9 h-5 rounded-full border transition-colors duration-200",
          "focus:outline-none focus:ring-1 focus:ring-transit-mint focus:ring-offset-1 focus:ring-offset-transit-canvas",
          checked
            ? "bg-transit-mint border-transit-mint"
            : "bg-transit-surface border-transit-border",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-transit-canvas transition-transform duration-200",
            checked ? "translate-x-4" : "translate-x-0",
          ].join(" ")}
          aria-hidden="true"
        />
      </button>

      {/* Hidden checkbox carries the value in form data */}
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={() => {
          // Controlled by button above; onChange is a no-op to silence React's uncontrolled warning
        }}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div>
        <label
          htmlFor={id}
          className="block text-sm text-transit-periwinkle font-medium cursor-pointer select-none"
        >
          {label}
        </label>
        <p id={`${id}-hint`} className="text-[10px] text-transit-muted font-mono mt-0.5">
          {hint}
        </p>
      </div>
    </div>
  );
}
