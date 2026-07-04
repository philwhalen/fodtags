CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before` text,
	`after` text,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_season_year_idx` ON `audit_log` (`season_year`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `entry_counts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`event_id` integer NOT NULL,
	`paid_entries` integer NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_counts_event_id_idx` ON `entry_counts` (`event_id`);--> statement-breakpoint
CREATE INDEX `entry_counts_season_year_idx` ON `entry_counts` (`season_year`);--> statement-breakpoint
CREATE TABLE `event_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`event_id` integer NOT NULL,
	`pdga_number` integer,
	`display_name` text NOT NULL,
	`holder_id` integer,
	`raw_score_to_par` integer NOT NULL,
	`round_rating` integer,
	`player_rating_reported` integer,
	`tag_present` integer DEFAULT true NOT NULL,
	`round_final` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_id`) REFERENCES `tag_holders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_results_event_pdga_number_idx` ON `event_results` (`event_id`,`pdga_number`);--> statement-breakpoint
CREATE INDEX `event_results_season_year_idx` ON `event_results` (`season_year`);--> statement-breakpoint
CREATE INDEX `event_results_holder_id_idx` ON `event_results` (`holder_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`event_source_id` integer NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`event_date` text NOT NULL,
	`round_ordinal` integer,
	`canceled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_source_id`) REFERENCES `event_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_source_round_idx` ON `events` (`event_source_id`,`round_ordinal`);--> statement-breakpoint
CREATE INDEX `events_season_year_idx` ON `events` (`season_year`);--> statement-breakpoint
CREATE TABLE `player_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`pdga_number` integer NOT NULL,
	`holder_id` integer NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_id`) REFERENCES `tag_holders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_matches_season_pdga_number_idx` ON `player_matches` (`season_year`,`pdga_number`);--> statement-breakpoint
CREATE TABLE `pool_switches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`holder_id` integer NOT NULL,
	`effective_date` text NOT NULL,
	`from_pool` text NOT NULL,
	`to_pool` text NOT NULL,
	`approved_by` text NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_id`) REFERENCES `tag_holders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pool_switches_holder_effective_date_idx` ON `pool_switches` (`holder_id`,`effective_date`);--> statement-breakpoint
CREATE INDEX `pool_switches_season_year_idx` ON `pool_switches` (`season_year`);--> statement-breakpoint
CREATE TABLE `ratings_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`holder_id` integer NOT NULL,
	`effective_date` text NOT NULL,
	`rating` integer NOT NULL,
	`official` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_id`) REFERENCES `tag_holders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ratings_history_holder_date_official_idx` ON `ratings_history` (`holder_id`,`effective_date`,`official`);--> statement-breakpoint
CREATE INDEX `ratings_history_season_year_idx` ON `ratings_history` (`season_year`);--> statement-breakpoint
ALTER TABLE `event_sources` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `event_sources` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `event_sources` ADD `complete` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event_sources` ADD `divisions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tag_holders` ADD `pdga_membership` integer DEFAULT false NOT NULL;