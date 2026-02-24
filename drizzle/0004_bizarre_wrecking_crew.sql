CREATE TABLE `cron_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`cron_name` text NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration_ms` integer,
	`error` text,
	`output` text
);
