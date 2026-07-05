CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`spent_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expenses_season_year_idx` ON `expenses` (`season_year`);--> statement-breakpoint
CREATE TABLE `financial_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`fund` text NOT NULL,
	`delta_cents` integer NOT NULL,
	`adjusted_date` text NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `financial_adjustments_season_year_idx` ON `financial_adjustments` (`season_year`);--> statement-breakpoint
CREATE TABLE `financial_openings` (
	`season_year` integer PRIMARY KEY NOT NULL,
	`ace_opening_cents` integer DEFAULT 0 NOT NULL,
	`reserves_opening_cents` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`kind` text NOT NULL,
	`paid_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`sub_league` text,
	`pool` text,
	`recipient_holder_id` integer,
	`note` text,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_holder_id`) REFERENCES `tag_holders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payouts_season_year_idx` ON `payouts` (`season_year`);--> statement-breakpoint
CREATE TABLE `tag_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`sale_date` text NOT NULL,
	`count` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tag_sales_season_year_idx` ON `tag_sales` (`season_year`);--> statement-breakpoint
ALTER TABLE `entry_counts` ADD `ace_entries` integer DEFAULT 0 NOT NULL;