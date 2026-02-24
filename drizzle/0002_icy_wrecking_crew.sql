CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`enriched_prompt` text,
	`status` text DEFAULT 'created' NOT NULL,
	`source` text DEFAULT 'chat' NOT NULL,
	`branch` text,
	`pr_url` text,
	`run_url` text,
	`summary` text,
	`result` text,
	`error` text,
	`chat_id` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`content` text NOT NULL,
	`source_job_id` text,
	`relevance` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
