CREATE TABLE `events` (
	`event_id` text NOT NULL,
	`link_id` text NOT NULL,
	`viewer` text NOT NULL,
	`version` integer NOT NULL,
	`opened_at` text NOT NULL,
	`dwell_ms` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`owner_user_id` text,
	`title` text,
	`require_email` integer DEFAULT false NOT NULL,
	`allowed_domains` text,
	`expires_at` text,
	`revoked` integer DEFAULT false NOT NULL,
	`verify_email` integer DEFAULT false NOT NULL,
	`track` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_slug_unique` ON `links` (`slug`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` text NOT NULL,
	`version` integer NOT NULL,
	`html` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `viewers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` text NOT NULL,
	`email` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE cascade
);
