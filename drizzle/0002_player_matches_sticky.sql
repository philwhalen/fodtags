PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `player_matches_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`pdga_number` integer NOT NULL,
	`holder_id` integer,
	`source` text NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`holder_id`) REFERENCES `tag_holders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `player_matches_new` (`id`, `season_year`, `pdga_number`, `holder_id`, `source`, `decided_by`, `decided_at`)
SELECT
	`id`,
	`season_year`,
	`pdga_number`,
	`holder_id`,
	CASE WHEN `confirmed_by` IS NOT NULL AND trim(`confirmed_by`) != '' THEN 'admin' ELSE 'auto' END,
	COALESCE(NULLIF(trim(`confirmed_by`), ''), 'auto'),
	`confirmed_at`
FROM `player_matches`;--> statement-breakpoint
DROP TABLE `player_matches`;--> statement-breakpoint
ALTER TABLE `player_matches_new` RENAME TO `player_matches`;--> statement-breakpoint
CREATE UNIQUE INDEX `player_matches_season_pdga_number_idx` ON `player_matches` (`season_year`, `pdga_number`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
