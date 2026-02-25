import { randomUUID } from 'crypto';
import { desc, eq, and, sql, gte } from 'drizzle-orm';
import { getDb } from './index.js';
import { auditLogs } from './schema.js';
import type { AuditLogEntry, ToolPolicyDecision } from '../types.js';

/**
 * Insert an audit log entry. Fire-and-forget — errors are logged but not thrown.
 */
export function logAuditEntry(entry: AuditLogEntry): void {
  try {
    const db = getDb();
    db.insert(auditLogs).values({
      id: randomUUID(),
      agentName: entry.agentName,
      toolName: entry.toolName,
      args: entry.args ? String(entry.args).slice(0, 5000) : null,
      result: entry.result ? String(entry.result).slice(0, 2000) : null,
      policy: entry.policy,
      decision: entry.decision,
      threadId: entry.threadId || null,
      durationMs: entry.durationMs || null,
      createdAt: Date.now(),
    }).run();
  } catch (err) {
    console.error('[audit] Failed to log entry:', err);
  }
}

interface GetAuditLogsOptions {
  page?: number;
  limit?: number;
  agentName?: string;
  toolName?: string;
  decision?: string;
}

/**
 * Get audit logs with pagination and optional filters.
 */
export function getAuditLogs({ page = 1, limit = 50, agentName, toolName, decision }: GetAuditLogsOptions = {}) {
  const db = getDb();
  const conditions = [];

  if (agentName) conditions.push(eq(auditLogs.agentName, agentName));
  if (toolName) conditions.push(eq(auditLogs.toolName, toolName));
  if (decision) conditions.push(eq(auditLogs.decision, decision));

  let query = db.select().from(auditLogs);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const offset = (page - 1) * limit;
  return query.orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset).all();
}

/**
 * Get audit log counts by decision type.
 */
export function getAuditStats() {
  const db = getDb();
  return db
    .select({
      decision: auditLogs.decision,
      count: sql<number>`COUNT(*)`,
    })
    .from(auditLogs)
    .groupBy(auditLogs.decision)
    .all();
}
