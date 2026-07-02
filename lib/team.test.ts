import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { listPendingInvitations } from "@/lib/team";

function makeTestDb() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "sentou-team-")), "t.db");
  const db = getDb(file);
  migrate(db, { migrationsFolder: "lib/db/migrations" });
  return db;
}

const ORG_ID = "org-1";
const INVITE_ID = "invite-token-secret";

function seed(db: ReturnType<typeof makeTestDb>) {
  const now = new Date();
  db.insert(schema.user)
    .values({ id: "u-inviter", name: "Owner", email: "owner@example.com", createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.organization)
    .values({ id: ORG_ID, name: "Workspace", slug: "workspace", createdAt: now })
    .run();
  db.insert(schema.invitation)
    .values({
      id: INVITE_ID,
      organizationId: ORG_ID,
      email: "invitee@example.com",
      role: "admin",
      status: "pending",
      expiresAt: new Date(now.getTime() + 48 * 3600_000),
      createdAt: now,
      inviterId: "u-inviter",
    })
    .run();
}

describe("listPendingInvitations", () => {
  let db: ReturnType<typeof makeTestDb>;

  beforeEach(() => {
    db = makeTestDb();
    seed(db);
  });

  it("returns nothing for a non-admin actor, so the invite token never reaches them", () => {
    const rows = listPendingInvitations(db, ORG_ID, false);
    expect(rows).toEqual([]);
    // Belt-and-suspenders: the acceptance token must not appear anywhere in the output.
    expect(JSON.stringify(rows)).not.toContain(INVITE_ID);
  });

  it("returns the pending invitation (including its id) for an admin actor", () => {
    const rows = listPendingInvitations(db, ORG_ID, true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: INVITE_ID,
      email: "invitee@example.com",
      role: "admin",
      inviterName: "Owner",
    });
    expect(typeof rows[0].expiresAt).toBe("string");
    expect(typeof rows[0].createdAt).toBe("string");
  });

  it("excludes non-pending invitations even for an admin", () => {
    expect(listPendingInvitations(db, ORG_ID, true)).toHaveLength(1);
    db.update(schema.invitation)
      .set({ status: "accepted" })
      .where(eq(schema.invitation.id, INVITE_ID))
      .run();
    expect(listPendingInvitations(db, ORG_ID, true)).toEqual([]);
  });
});
