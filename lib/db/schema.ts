import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const links = sqliteTable("links", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  ownerUserId: text("owner_user_id"),            // references user.id; null = legacy/imported
  title: text("title"),
  requireEmail: integer("require_email", { mode: "boolean" }).notNull().default(false),
  allowedDomains: text("allowed_domains", { mode: "json" }).$type<string[] | null>(),
  expiresAt: text("expires_at"),
  revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
  verifyEmail: integer("verify_email", { mode: "boolean" }).notNull().default(false),
  track: integer("track", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const versions = sqliteTable("versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  linkId: text("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  html: text("html").notNull(),
  createdAt: text("created_at").notNull(),
});

export const viewers = sqliteTable("viewers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  linkId: text("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  at: text("at").notNull(),
});

export const events = sqliteTable("events", {
  eventId: text("event_id").notNull(),
  linkId: text("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  viewer: text("viewer").notNull(),
  version: integer("version").notNull(),
  openedAt: text("opened_at").notNull(),
  dwellMs: integer("dwell_ms").notNull().default(0),
});
