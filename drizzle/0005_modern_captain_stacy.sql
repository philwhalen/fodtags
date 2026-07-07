-- Hand-edited (sub-plan 01). drizzle-kit generated a plain `PRAGMA
-- foreign_keys=OFF` around this rebuild, which is a no-op here: the
-- migrator (drizzle-orm's better-sqlite3 `migrate()`) wraps every pending
-- migration file's statements in one long-running BEGIN/COMMIT, and SQLite
-- only allows toggling the `foreign_keys` pragma when there is NO pending
-- transaction. `tag_holders` has FK dependents (event_results,
-- ratings_history, pool_switches, payouts all reference `tag_holders.id`),
-- so under this repo's connection (foreign_keys=ON always — see
-- src/server/db/client.ts) the plain rebuild's DROP TABLE either fails
-- immediately, or (with `defer_foreign_keys`) fails at COMMIT even though
-- every row is actually consistent, because SQLite's deferred-constraint
-- bookkeeping doesn't reconcile a same-name drop+recreate against tables it
-- didn't itself touch.
--
-- Workaround: end the migrator's outer transaction with an explicit COMMIT,
-- do the rebuild in our own transaction with `foreign_keys` genuinely OFF
-- (SQLite's documented 12-step "other kinds of schema change" recipe —
-- https://sqlite.org/lang_altertable.html#otheralter), COMMIT that, turn
-- `foreign_keys` back ON, and re-open a transaction with a bare BEGIN so the
-- migrator's own trailing bookkeeping INSERT + final COMMIT (which run
-- immediately after this file's statements) still have an active
-- transaction to operate in.
COMMIT;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
BEGIN;--> statement-breakpoint
CREATE TABLE `__new_tag_holders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_year` integer NOT NULL,
	`name` text NOT NULL,
	`tag_number` integer,
	`pool` text NOT NULL,
	`entry_date` text NOT NULL,
	`pdga_number` integer,
	`rating_at_entry` integer,
	`active` integer DEFAULT true NOT NULL,
	`pdga_membership` integer DEFAULT false NOT NULL,
	`confirmed` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`season_year`) REFERENCES `seasons`(`year`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tag_holders`("id", "season_year", "name", "tag_number", "pool", "entry_date", "pdga_number", "rating_at_entry", "active", "pdga_membership", "confirmed") SELECT "id", "season_year", "name", "tag_number", "pool", "entry_date", "pdga_number", "rating_at_entry", "active", "pdga_membership", true FROM `tag_holders`;--> statement-breakpoint
DROP TABLE `tag_holders`;--> statement-breakpoint
ALTER TABLE `__new_tag_holders` RENAME TO `tag_holders`;--> statement-breakpoint
CREATE UNIQUE INDEX `tag_holders_season_tag_number_idx` ON `tag_holders` (`season_year`,`tag_number`);--> statement-breakpoint
CREATE INDEX `tag_holders_season_year_idx` ON `tag_holders` (`season_year`);--> statement-breakpoint
COMMIT;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
BEGIN;
