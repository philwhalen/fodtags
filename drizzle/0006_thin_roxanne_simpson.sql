CREATE TABLE `tag_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`event_id` integer NOT NULL,
	`holder_id` integer NOT NULL,
	`tag_out` integer NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_id`) REFERENCES `tag_holders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_overrides_event_holder_idx` ON `tag_overrides` (`event_id`,`holder_id`);--> statement-breakpoint
CREATE INDEX `tag_overrides_season_year_idx` ON `tag_overrides` (`season_year`);--> statement-breakpoint
ALTER TABLE `tag_holders` ADD `current_tag_number` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `tag_holders_season_current_tag_idx` ON `tag_holders` (`season_year`,`current_tag_number`);