CREATE TABLE `usage_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0,
	`completion_tokens` integer DEFAULT 0,
	`total_tokens` integer DEFAULT 0,
	`cost_usd` integer,
	`duration_ms` integer,
	`source` text DEFAULT 'chat',
	`created_at` integer NOT NULL
);
