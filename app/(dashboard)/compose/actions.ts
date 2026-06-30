"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getStore } from "@/lib/server-store";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { createLink, OPEN_GATE } from "@/lib/links";
import { emailConfigured } from "@/lib/email";

export type PublishState = {
  slug: string | null;
  error: string | null;
};

export const INITIAL_STATE: PublishState = { slug: null, error: null };

export async function publishAction(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  if (!session) {
    return { slug: null, error: "Not authenticated. Please sign in." };
  }

  const title = ((formData.get("title") as string | null) ?? "").trim();
  const html = (formData.get("html") as string | null) ?? "";
  if (!html.trim()) {
    return { slug: null, error: "HTML payload is required." };
  }

  // Expiry validation — mirror /api/publish exactly
  let expiresAt: string | null = null;
  const expiresAtRaw = ((formData.get("expiresAt") as string | null) ?? "").trim();
  if (expiresAtRaw) {
    if (Number.isNaN(new Date(expiresAtRaw).getTime())) {
      return { slug: null, error: "Expiry date is not a valid date." };
    }
    expiresAt = expiresAtRaw;
  }

  // Domain allowlist — mirror /api/publish: trim, drop empties
  const allowedDomainsRaw = (formData.get("allowedDomains") as string | null) ?? "";
  const domains = allowedDomainsRaw
    ? allowedDomainsRaw
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d.length > 0)
    : [];

  const requireEmail = formData.get("requireEmail") === "on";
  const verifyEmail = formData.get("verifyEmail") === "on";
  const track = formData.get("track") === "on";

  // Mirror /api/publish: refuse verifyEmail in prod without a configured sender.
  // A link with verifyEmail=true but no sender means recipients hit a dead end.
  if (verifyEmail && !emailConfigured() && process.env.NODE_ENV === "production") {
    return {
      slug: null,
      error:
        "Email verification requires SENTOU_RESEND_KEY and SENTOU_EMAIL_FROM to be configured.",
    };
  }

  const gate = {
    ...OPEN_GATE,
    requireEmail,
    allowedDomains: domains.length > 0 ? domains : null,
    expiresAt,
  };

  try {
    const store = getStore();
    const link = await createLink(store, html, gate, track, verifyEmail, session.user.id);

    // Title is not part of createLink's interface, and store-sqlite's put() hardcodes
    // title: null on INSERT. Crucially, title is excluded from onConflictDoUpdate's SET
    // clause, so this post-hoc write will NOT be overwritten by any subsequent put() call
    // (e.g. a tracking beacon or viewer write). Safe to do synchronously before returning.
    if (title) {
      getDb()
        .update(schema.links)
        .set({ title })
        .where(eq(schema.links.id, link.id))
        .run();
    }

    return { slug: link.slug, error: null };
  } catch (err) {
    console.error("[compose] createLink failed:", err);
    return { slug: null, error: "Failed to create route. Please try again." };
  }
}
