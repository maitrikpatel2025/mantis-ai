'use strict';

import { getDb } from './index.js';
import { usageLogs } from './schema.js';
import { desc, sql, and, gte } from 'drizzle-orm';

/**
 * Record a usage log entry.
 * @param {object} entry
 */
export function recordUsage(entry) {
  const db = getDb();
  db.insert(usageLogs).values({
    id: entry.id || crypto.randomUUID(),
    threadId: entry.threadId || null,
    model: entry.model,
    provider: entry.provider,
    promptTokens: entry.promptTokens || 0,
    completionTokens: entry.completionTokens || 0,
    totalTokens: entry.totalTokens || 0,
    costUsd: entry.costUsd || null,
    durationMs: entry.durationMs || null,
    source: entry.source || 'chat',
    createdAt: Date.now(),
  }).run();
}

/**
 * Get usage stats for a period.
 * @param {'24h'|'7d'|'30d'|'all'} period
 */
export function getUsageStats(period = '7d') {
  const db = getDb();
  const since = periodToTimestamp(period);
  const where = since ? gte(usageLogs.createdAt, since) : undefined;

  const rows = db
    .select({
      totalRequests: sql`COUNT(*)`,
      totalPromptTokens: sql`COALESCE(SUM(${usageLogs.promptTokens}), 0)`,
      totalCompletionTokens: sql`COALESCE(SUM(${usageLogs.completionTokens}), 0)`,
      totalTokens: sql`COALESCE(SUM(${usageLogs.totalTokens}), 0)`,
      totalCostUsd: sql`COALESCE(SUM(${usageLogs.costUsd}), 0)`,
      avgDurationMs: sql`COALESCE(AVG(${usageLogs.durationMs}), 0)`,
    })
    .from(usageLogs)
    .where(where)
    .all();

  return rows[0] || { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCostUsd: 0, avgDurationMs: 0 };
}

/**
 * Get usage broken down by model for a period.
 * @param {'24h'|'7d'|'30d'|'all'} period
 */
export function getUsageByModel(period = '7d') {
  const db = getDb();
  const since = periodToTimestamp(period);
  const where = since ? gte(usageLogs.createdAt, since) : undefined;

  return db
    .select({
      model: usageLogs.model,
      provider: usageLogs.provider,
      requests: sql`COUNT(*)`,
      totalTokens: sql`COALESCE(SUM(${usageLogs.totalTokens}), 0)`,
      totalCost: sql`COALESCE(SUM(${usageLogs.costUsd}), 0)`,
    })
    .from(usageLogs)
    .where(where)
    .groupBy(usageLogs.model, usageLogs.provider)
    .orderBy(sql`COUNT(*) DESC`)
    .all();
}

/**
 * Get usage per day for the last N days.
 * @param {number} days
 */
export function getUsageByDay(days = 7) {
  const db = getDb();
  const since = Date.now() - days * 86400000;

  return db
    .select({
      day: sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch')`.as('day'),
      requests: sql`COUNT(*)`,
      totalTokens: sql`COALESCE(SUM(${usageLogs.totalTokens}), 0)`,
      totalCost: sql`COALESCE(SUM(${usageLogs.costUsd}), 0)`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, since))
    .groupBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch') ASC`)
    .all();
}

/**
 * Get usage grouped by source for a period.
 * @param {'24h'|'7d'|'30d'|'all'} period
 */
export function getUsageBySource(period = '7d') {
  const db = getDb();
  const since = periodToTimestamp(period);
  const where = since ? gte(usageLogs.createdAt, since) : undefined;

  return db
    .select({
      source: usageLogs.source,
      requests: sql`COUNT(*)`,
      totalTokens: sql`COALESCE(SUM(${usageLogs.totalTokens}), 0)`,
      totalCost: sql`COALESCE(SUM(${usageLogs.costUsd}), 0)`,
    })
    .from(usageLogs)
    .where(where)
    .groupBy(usageLogs.source)
    .orderBy(sql`COUNT(*) DESC`)
    .all();
}

/**
 * Get token breakdown (prompt vs completion) per day.
 * @param {number} days
 */
export function getTokenBreakdownByDay(days = 7) {
  const db = getDb();
  const since = Date.now() - days * 86400000;

  return db
    .select({
      day: sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch')`.as('day'),
      promptTokens: sql`COALESCE(SUM(${usageLogs.promptTokens}), 0)`,
      completionTokens: sql`COALESCE(SUM(${usageLogs.completionTokens}), 0)`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, since))
    .groupBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch') ASC`)
    .all();
}

/**
 * Get last 7 days of tokens + cost per day for dashboard sparklines.
 * @returns {{ tokens: Array<{day: string, value: number}>, cost: Array<{day: string, value: number}> }}
 */
export function getDashboardSparklines() {
  const db = getDb();
  const since = Date.now() - 7 * 86400000;

  const rows = db
    .select({
      day: sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch')`.as('day'),
      totalTokens: sql`COALESCE(SUM(${usageLogs.totalTokens}), 0)`,
      totalCost: sql`COALESCE(SUM(${usageLogs.costUsd}), 0)`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, since))
    .groupBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`DATE(${usageLogs.createdAt} / 1000, 'unixepoch') ASC`)
    .all();

  return {
    tokens: rows.map((r) => ({ day: r.day, value: Number(r.totalTokens) })),
    cost: rows.map((r) => ({ day: r.day, value: Number(r.totalCost) })),
  };
}

function periodToTimestamp(period) {
  const now = Date.now();
  switch (period) {
    case '24h': return now - 86400000;
    case '7d': return now - 7 * 86400000;
    case '30d': return now - 30 * 86400000;
    default: return null;
  }
}
