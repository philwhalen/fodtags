ALTER TABLE `event_sources` ADD `stale` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event_sources` ADD `last_good_at` text;