import { eq, desc, inArray, sql, gte } from 'drizzle-orm';
import { getDb } from './index.js';
import { jobs } from './schema.js';
import { emitEvent } from '../events/bus.js';

interface InsertJobParams {
  id: string;
  prompt: string;
  enrichedPrompt?: string;
  source?: string;
  branch?: string;
  runnerType?: string;
  chatId?: string;
}

interface CompleteJobParams {
  summary?: string;
  result?: string;
  prUrl?: string;
}

/**
 * Insert a new job record.
 */
export function insertJob({ id, prompt, enrichedPrompt, source = 'chat', branch, runnerType, chatId }: InsertJobParams) {
  const db = getDb();
  const job = {
    id,
    prompt,
    enrichedPrompt: enrichedPrompt || null,
    status: 'created',
    source,
    branch: branch || null,
    runnerType: runnerType || null,
    chatId: chatId || null,
    createdAt: Date.now(),
  };
  db.insert(jobs).values(job).run();
  emitEvent('job:created', job);
  return job;
}

/**
 * Get a single job by ID.
 */
export function getJobById(jobId: string) {
  const db = getDb();
  return db.select().from(jobs).where(eq(jobs.id, jobId)).get();
}

/**
 * Update arbitrary fields on a job.
 */
export function updateJob(jobId: string, fields: Record<string, unknown>): void {
  const db = getDb();
  db.update(jobs).set(fields).where(eq(jobs.id, jobId)).run();
  emitEvent('job:updated', { id: jobId, ...fields });
}

/**
 * Mark a job as completed.
 */
export function completeJob(jobId: string, { summary, result, prUrl }: CompleteJobParams = {}): void {
  const db = getDb();
  const fields: Record<string, unknown> = {
    status: 'completed',
    completedAt: Date.now(),
  };
  if (summary) fields.summary = summary;
  if (result) fields.result = result;
  if (prUrl) fields.prUrl = prUrl;
  db.update(jobs).set(fields).where(eq(jobs.id, jobId)).run();
  emitEvent('job:completed', { id: jobId, summary, prUrl });
}

/**
 * Mark a job as failed.
 */
export function failJob(jobId: string, error: string): void {
  const db = getDb();
  db.update(jobs)
    .set({ status: 'failed', completedAt: Date.now(), error })
    .where(eq(jobs.id, jobId))
    .run();
  emitEvent('job:failed', { id: jobId, error });
}

/**
 * Get recent jobs with optional pagination and status filter.
 */
export function getRecentJobs({ limit = 20, offset = 0, status }: { limit?: number; offset?: number; status?: string } = {}) {
  const db = getDb();
  let query = db.select().from(jobs);
  if (status) {
    query = query.where(eq(jobs.status, status)) as typeof query;
  }
  return query.orderBy(desc(jobs.createdAt)).limit(limit).offset(offset).all();
}

/**
 * Get all active jobs (created or queued).
 */
export function getActiveJobs() {
  const db = getDb();
  return db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ['created', 'queued']))
    .orderBy(desc(jobs.createdAt))
    .all();
}

/**
 * Get jobs created per day for the last N days.
 */
export function getJobsByDay(days: number = 7) {
  const db = getDb();
  const since = Date.now() - days * 86400000;

  return db
    .select({
      day: sql<string>`DATE(${jobs.createdAt} / 1000, 'unixepoch')`.as('day'),
      count: sql<number>`COUNT(*)`,
    })
    .from(jobs)
    .where(gte(jobs.createdAt, since))
    .groupBy(sql`DATE(${jobs.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`DATE(${jobs.createdAt} / 1000, 'unixepoch') ASC`)
    .all();
}

/**
 * Get job counts grouped by status.
 */
export function getJobCounts(): Record<string, number> {
  const db = getDb();
  const rows = db
    .select({
      status: jobs.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(jobs)
    .groupBy(jobs.status)
    .all();

  const counts: Record<string, number> = { created: 0, queued: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}
