// Notification dispatch: called from the track route when a viewer's first open
// is detected. Runs async and non-blocking — callers fire and forget.
// Failures are logged but never surface to the caller.

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getSender, emailConfigured } from "@/lib/email";
import { assertSafeWebhookUrl } from "@/lib/ssrf";

export interface OpenNotifyOpts {
  linkId: string;
  linkTitle: string | null;
  ownerUserId: string | null;
  viewer: string;
  openedAt: string;
}

// Webhook payload shape (documented here for the report):
// {
//   event: "link.opened",
//   linkId: string,
//   linkTitle: string | null,
//   viewer: string,
//   openedAt: string (ISO 8601),
//   timestamp: string (ISO 8601, wall time of the dispatch),
// }

export async function maybeNotifyOpen(opts: OpenNotifyOpts): Promise<void> {
  const { linkId, linkTitle, ownerUserId, viewer, openedAt } = opts;

  // No owner = legacy/imported link; skip.
  if (!ownerUserId) return;

  const db = getDb();

  // Look up this owner's prefs. No row = all channels off (default).
  const prefs = db
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, ownerUserId))
    .get();

  if (!prefs) return;

  const { emailOnOpen, webhookUrl } = prefs;
  if (!emailOnOpen && !webhookUrl) return;

  const tasks: Promise<void>[] = [];

  if (emailOnOpen && emailConfigured()) {
    // Look up the owner's email address for delivery.
    const ownerRow = db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, ownerUserId))
      .get();

    if (ownerRow?.email) {
      tasks.push(
        getSender()
          .sendOpenNotification(ownerRow.email, { linkTitle, viewer, openedAt })
          .catch((err: unknown) => {
            console.error("[sentou] open notification email failed:", err);
          }),
      );
    }
  }

  if (webhookUrl) {
    const payload = JSON.stringify({
      event: "link.opened",
      linkId,
      linkTitle,
      viewer,
      openedAt,
      timestamp: new Date().toISOString(),
    });

    // SSRF guard: resolve the host and refuse to POST to internal address space. The owner
    // (or a member) controls this URL, so it must not be trusted to reach the host's internals.
    tasks.push(
      assertSafeWebhookUrl(webhookUrl)
        .then(() =>
          fetch(webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload,
            // Do not let a 30x bounce the request to an internal target after the host check.
            redirect: "manual",
          }),
        )
        .then((res) => {
          if (!res.ok) {
            console.warn(`[sentou] webhook ${webhookUrl} returned ${res.status}`);
          }
        })
        .catch((err: unknown) => {
          console.error("[sentou] webhook delivery failed:", err);
        }),
    );
  }

  await Promise.allSettled(tasks);
}
