import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import { createLink } from "@/lib/links";
import { getStore } from "@/lib/server-store";
import * as schema from "@/lib/db/schema";
import { maybeNotifyOpen } from "@/lib/notifications";

// Wire a fresh isolated DB for every test.
beforeEach(() => {
  process.env.SENTOU_DB = path.join(mkdtempSync(path.join(tmpdir(), "sentou-notif-")), "db.sqlite");
  // Ensure migrations run into the fresh DB via getStore's lazy migrate.
  getStore();
  // Also run into getDb directly so relational queries work.
  migrate(getDb(), { migrationsFolder: "lib/db/migrations" });
});

afterEach(() => {
  delete process.env.SENTOU_RESEND_KEY;
  delete process.env.SENTOU_EMAIL_FROM;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Helper: create a minimal user row so FK constraints pass.
function seedUser(id = "owner1", email = "owner@example.com") {
  const db = getDb();
  const now = new Date();
  db.insert(schema.user)
    .values({ id, name: "Owner", email, emailVerified: false, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .run();
  return { id, email };
}

function setPrefs(userId: string, emailOnOpen: boolean, webhookUrl: string | null = null) {
  const db = getDb();
  db.insert(schema.notificationPrefs)
    .values({ userId, emailOnOpen, webhookUrl })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { emailOnOpen, webhookUrl },
    })
    .run();
}

function getPrefs(userId: string) {
  return getDb()
    .select()
    .from(schema.notificationPrefs)
    .where(eq(schema.notificationPrefs.userId, userId))
    .get();
}

// ── recordOpen first-open flag ───────────────────────────────────────────────

describe("recordOpen — first-open flag", () => {
  it("returns true for a viewer's first open of a link", async () => {
    const { recordOpen } = await import("@/lib/links");
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const result = await recordOpen(getStore(), {
      eventId: "ev1", linkId: link.id, viewer: "a@x.com",
      version: 1, openedAt: new Date().toISOString(), dwellMs: 0,
    });
    expect(result).toBe(true);
  });

  it("returns false for a duplicate eventId (same beacon resent)", async () => {
    const { recordOpen } = await import("@/lib/links");
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const ev = {
      eventId: "ev1", linkId: link.id, viewer: "a@x.com",
      version: 1, openedAt: new Date().toISOString(), dwellMs: 0,
    };
    const first = await recordOpen(getStore(), ev);
    const dup = await recordOpen(getStore(), ev); // same eventId
    expect(first).toBe(true);
    expect(dup).toBe(false);
  });

  it("returns false for a second distinct eventId from the same viewer", async () => {
    const { recordOpen } = await import("@/lib/links");
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const base = { linkId: link.id, viewer: "a@x.com", version: 1, openedAt: new Date().toISOString(), dwellMs: 0 };
    const first = await recordOpen(getStore(), { ...base, eventId: "ev1" });
    const second = await recordOpen(getStore(), { ...base, eventId: "ev2" });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("returns true for a different viewer on the same link", async () => {
    const { recordOpen } = await import("@/lib/links");
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true);
    const base = { linkId: link.id, version: 1, openedAt: new Date().toISOString(), dwellMs: 0 };
    const r1 = await recordOpen(getStore(), { ...base, viewer: "a@x.com", eventId: "ev1" });
    const r2 = await recordOpen(getStore(), { ...base, viewer: "b@x.com", eventId: "ev2" });
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });
});

// ── maybeNotifyOpen ──────────────────────────────────────────────────────────

describe("maybeNotifyOpen — email channel", () => {
  it("does not call fetch when emailOnOpen is false and no webhook", async () => {
    const { id: userId } = seedUser();
    setPrefs(userId, false, null);
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true, false, userId);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.SENTOU_RESEND_KEY = "re_test";
    process.env.SENTOU_EMAIL_FROM = "Sentou <no-reply@example.com>";

    await maybeNotifyOpen({
      linkId: link.id, linkTitle: null, ownerUserId: userId,
      viewer: "v@x.com", openedAt: new Date().toISOString(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Resend when emailOnOpen is true and email is configured", async () => {
    const { id: userId } = seedUser();
    setPrefs(userId, true, null);
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true, false, userId);

    process.env.SENTOU_RESEND_KEY = "re_test";
    process.env.SENTOU_EMAIL_FROM = "Sentou <no-reply@example.com>";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await maybeNotifyOpen({
      linkId: link.id, linkTitle: "My Link", ownerUserId: userId,
      viewer: "v@x.com", openedAt: new Date().toISOString(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0] as unknown[];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.to).toBe("owner@example.com");
    expect(body.subject).toContain("My Link");
    expect(body.html).toContain("v@x.com");
  });

  it("does not attempt email when emailOnOpen is true but no sender configured", async () => {
    const { id: userId } = seedUser();
    setPrefs(userId, true, null);
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true, false, userId);

    // No SENTOU_RESEND_KEY → emailConfigured() false → skip email silently
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      maybeNotifyOpen({
        linkId: link.id, linkTitle: null, ownerUserId: userId,
        viewer: "v@x.com", openedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("maybeNotifyOpen — webhook channel", () => {
  it("POSTs the webhook payload when webhookUrl is set", async () => {
    const { id: userId } = seedUser();
    setPrefs(userId, false, "https://203.0.113.10/sentou");
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true, false, userId);

    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const openedAt = new Date().toISOString();
    await maybeNotifyOpen({
      linkId: link.id, linkTitle: "Demo", ownerUserId: userId,
      viewer: "v@x.com", openedAt,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0] as unknown[];
    const url = callArgs[0] as string;
    const init = callArgs[1] as RequestInit;
    expect(url).toBe("https://203.0.113.10/sentou");
    expect(init.method).toBe("POST");
    const payload = JSON.parse(init.body as string);
    expect(payload.event).toBe("link.opened");
    expect(payload.linkId).toBe(link.id);
    expect(payload.linkTitle).toBe("Demo");
    expect(payload.viewer).toBe("v@x.com");
    expect(payload.openedAt).toBe(openedAt);
    expect(typeof payload.timestamp).toBe("string");
  });

  it("resolves (does not throw) when webhook returns non-2xx", async () => {
    const { id: userId } = seedUser();
    setPrefs(userId, false, "https://203.0.113.10/fail");
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true, false, userId);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));

    await expect(
      maybeNotifyOpen({
        linkId: link.id, linkTitle: null, ownerUserId: userId,
        viewer: "v@x.com", openedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });

  it("resolves when the webhook fetch throws (network error)", async () => {
    const { id: userId } = seedUser();
    setPrefs(userId, false, "https://203.0.113.10/throw");
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true, false, userId);

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));

    await expect(
      maybeNotifyOpen({
        linkId: link.id, linkTitle: null, ownerUserId: userId,
        viewer: "v@x.com", openedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });
});

describe("maybeNotifyOpen — no prefs / no owner", () => {
  it("silently returns when ownerUserId is null", async () => {
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true, false, null);
    await expect(
      maybeNotifyOpen({
        linkId: link.id, linkTitle: null, ownerUserId: null,
        viewer: "v@x.com", openedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });

  it("silently returns when no prefs row exists (defaults off)", async () => {
    const { id: userId } = seedUser();
    const link = await createLink(getStore(), "<h1>x</h1>", undefined, true, false, userId);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      maybeNotifyOpen({
        linkId: link.id, linkTitle: null, ownerUserId: userId,
        viewer: "v@x.com", openedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── Prefs read/write ─────────────────────────────────────────────────────────

describe("notification_prefs — DB read/write", () => {
  it("no row before first save", () => {
    const { id: userId } = seedUser();
    expect(getPrefs(userId)).toBeUndefined();
  });

  it("upserts prefs and reads them back", () => {
    const { id: userId } = seedUser();

    setPrefs(userId, true, "https://example.com/hook");
    const after = getPrefs(userId);
    expect(after?.emailOnOpen).toBe(true);
    expect(after?.webhookUrl).toBe("https://example.com/hook");
  });

  it("updates prefs on second upsert", () => {
    const { id: userId } = seedUser();
    setPrefs(userId, true, "https://example.com/hook");
    setPrefs(userId, false, null);
    const updated = getPrefs(userId);
    expect(updated?.emailOnOpen).toBe(false);
    expect(updated?.webhookUrl).toBeNull();
  });
});
