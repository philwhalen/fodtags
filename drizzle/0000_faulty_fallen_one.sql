CREATE TABLE `directors` (
	`email` text PRIMARY KEY NOT NULL,
	`added_by` text,
	`added_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`pdga_event_id` text NOT NULL,
	`type` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_sources_season_type_idx` ON `event_sources` (`season_year`,`type`);--> statement-breakpoint
CREATE INDEX `event_sources_season_year_idx` ON `event_sources` (`season_year`);--> statement-breakpoint
CREATE TABLE `published_pointer` (
	`season_year` integer PRIMARY KEY NOT NULL,
	`current_version` integer NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `read_model` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`version` integer NOT NULL,
	`view_key` text NOT NULL,
	`payload` text NOT NULL,
	`built_at` text NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `read_model_season_version_view_idx` ON `read_model` (`season_year`,`version`,`view_key`);--> statement-breakpoint
CREATE INDEX `read_model_season_year_idx` ON `read_model` (`season_year`);--> statement-breakpoint
CREATE TABLE `refresh_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`trigger` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`per_source` text DEFAULT '{}' NOT NULL,
	`counts` text DEFAULT '{}' NOT NULL,
	`error` text,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `refresh_runs_season_year_idx` ON `refresh_runs` (`season_year`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`year` integer PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag_holders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`name` text NOT NULL,
	`tag_number` integer NOT NULL,
	`pool` text NOT NULL,
	`entry_date` text NOT NULL,
	`pdga_number` integer,
	`rating_at_entry` integer,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_holders_season_tag_number_idx` ON `tag_holders` (`season_year`,`tag_number`);--> statement-breakpoint
CREATE INDEX `tag_holders_season_year_idx` ON `tag_holders` (`season_year`);