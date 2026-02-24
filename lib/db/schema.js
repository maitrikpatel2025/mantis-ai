import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('New Chat'),
  starred: integer('starred').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  notification: text('notification').notNull(),
  payload: text('payload').notNull(),
  read: integer('read').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  channelId: text('channel_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const usageLogs = sqliteTable('usage_logs', {
  id: text('id').primaryKey(),
  threadId: text('thread_id'),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  promptTokens: integer('prompt_tokens').default(0),
  completionTokens: integer('completion_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),
  costUsd: integer('cost_usd'),
  durationMs: integer('duration_ms'),
  source: text('source').default('chat'),
  createdAt: integer('created_at').notNull(),
});

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  prompt: text('prompt').notNull(),
  enrichedPrompt: text('enriched_prompt'),
  status: text('status').notNull().default('created'),
  source: text('source').notNull().default('chat'),
  branch: text('branch'),
  prUrl: text('pr_url'),
  runUrl: text('run_url'),
  summary: text('summary'),
  result: text('result'),
  error: text('error'),
  runnerType: text('runner_type'),
  chatId: text('chat_id'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  category: text('category').notNull().default('general'),
  content: text('content').notNull(),
  sourceJobId: text('source_job_id'),
  relevance: integer('relevance').notNull().default(5),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const cronRuns = sqliteTable('cron_runs', {
  id: text('id').primaryKey(),
  cronName: text('cron_name').notNull(),
  status: text('status').notNull().default('success'),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  output: text('output'),
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdBy: text('created_by'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
