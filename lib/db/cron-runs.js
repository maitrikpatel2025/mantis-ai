import crypto from 'crypto';
import { getDb } from './index.js';
import { cronRuns } from './schema.js';
import { desc, eq, sql } from 'drizzle-orm';
import { emitEvent } from '../events/bus.js';

/**
 * Insert a cron run record and emit SSE event.
 * @param {{ cronName: string, status: string, startedAt: number, completedAt?: number, durationMs?: number, error?: string, output?: string }} params
 */
export function insertCronRun(params) {
  const db = getDb();
  const id = crypto.randomUUID();
  const run = {
    id,
    cronName: params.cronName,
    status: params.status || 'success',
    startedAt: params.startedAt,
    completedAt: params.completedAt || null,
    durationMs: params.durationMs || null,
    error: params.error || null,
    output: params.output ? params.output.slice(0, 5000) : null,
  };
  db.insert(cronRuns).values(run).run();
  emitEvent('cron:run', run);
  return run;
}

/**
 * Get recent runs for a specific cron.
 * @param {string} cronName
 * @param {number} [limit=10]
 * @returns {object[]}
 */
export function getRecentCronRuns(cronName, limit = 10) {
  const db = getDb();
  return db
    .select()
    .from(cronRuns)
    .where(eq(cronRuns.cronName, cronName))
    .orderBy(desc(cronRuns.startedAt))
    .limit(limit)
    .all();
}

/**
 * Get per-cron aggregate stats.
 * @returns {object[]} Array of { cronName, total, success, failed, avgDurationMs, lastRunAt }
 */
export function getCronRunStats() {
  const db = getDb();
  return db
    .select({
      cronName: cronRuns.cronName,
      total: sql`COUNT(*)`.as('total'),
      success: sql`SUM(CASE WHEN ${cronRuns.status} = 'success' THEN 1 ELSE 0 END)`.as('success'),
      failed: sql`SUM(CASE WHEN ${cronRuns.status} = 'error' THEN 1 ELSE 0 END)`.as('failed'),
      avgDurationMs: sql`AVG(${cronRuns.durationMs})`.as('avg_duration_ms'),
      lastRunAt: sql`MAX(${cronRuns.startedAt})`.as('last_run_at'),
    })
    .from(cronRuns)
    .groupBy(cronRuns.cronName)
    .all();
}
