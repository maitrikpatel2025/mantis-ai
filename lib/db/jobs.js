import { eq, desc, inArray, sql, gte } from 'drizzle-orm';
import { getDb } from './index.js';
import { jobs } from './schema.js';
import { emitEvent } from '../events/bus.js';

/**
 * Insert a new job record.
 * @param {object} params
 * @param {string} params.id - Job UUID
 * @param {string} params.prompt - Original job description
 * @param {string} [params.enrichedPrompt] - Prompt after memory injection
 * @param {string} [params.source='chat'] - chat|cron|trigger|api
 * @param {string} [params.branch] - Git branch name
 * @param {string} [params.runnerType] - 'local' | 'github'
 * @param {string} [params.chatId] - Associated chat ID
 * @returns {object} The inserted job
 */
export function insertJob({ id, prompt, enrichedPrompt, source = 'chat', branch, runnerType, chatId }) {
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
 * @param {string} jobId
 * @returns {object|undefined}
 */
export function getJobById(jobId) {
  const db = getDb();
  return db.select().from(jobs).where(eq(jobs.id, jobId)).get();
}

/**
 * Update arbitrary fields on a job.
 * @param {string} jobId
 * @param {object} fields
 */
export function updateJob(jobId, fields) {
  const db = getDb();
  db.update(jobs).set(fields).where(eq(jobs.id, jobId)).run();
  emitEvent('job:updated', { id: jobId, ...fields });
}

/**
 * Mark a job as completed.
 * @param {string} jobId
 * @param {object} params
 * @param {string} [params.summary]
 * @param {string} [params.result] - JSON string
 * @param {string} [params.prUrl]
 */
export function completeJob(jobId, { summary, result, prUrl } = {}) {
  const db = getDb();
  const fields = {
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
 * @param {string} jobId
 * @param {string} error
 */
export function failJob(jobId, error) {
  const db = getDb();
  db.update(jobs)
    .set({ status: 'failed', completedAt: Date.now(), error })
    .where(eq(jobs.id, jobId))
    .run();
  emitEvent('job:failed', { id: jobId, error });
}

/**
 * Get recent jobs with optional pagination and status filter.
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {number} [options.offset=0]
 * @param {string} [options.status]
 * @returns {object[]}
 */
export function getRecentJobs({ limit = 20, offset = 0, status } = {}) {
  const db = getDb();
  let query = db.select().from(jobs);
  if (status) {
    query = query.where(eq(jobs.status, status));
  }
  return query.orderBy(desc(jobs.createdAt)).limit(limit).offset(offset).all();
}

/**
 * Get all active jobs (created or queued).
 * @returns {object[]}
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
 * @param {number} days
 * @returns {Array<{day: string, count: number}>}
 */
export function getJobsByDay(days = 7) {
  const db = getDb();
  const since = Date.now() - days * 86400000;

  return db
    .select({
      day: sql`DATE(${jobs.createdAt} / 1000, 'unixepoch')`.as('day'),
      count: sql`COUNT(*)`,
    })
    .from(jobs)
    .where(gte(jobs.createdAt, since))
    .groupBy(sql`DATE(${jobs.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`DATE(${jobs.createdAt} / 1000, 'unixepoch') ASC`)
    .all();
}

/**
 * Get job counts grouped by status.
 * @returns {object} e.g. { created: 0, queued: 1, completed: 5, failed: 2 }
 */
export function getJobCounts() {
  const db = getDb();
  const rows = db
    .select({
      status: jobs.status,
      count: sql`COUNT(*)`,
    })
    .from(jobs)
    .groupBy(jobs.status)
    .all();

  const counts = { created: 0, queued: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}
