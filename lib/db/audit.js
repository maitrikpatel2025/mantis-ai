import { randomUUID } from "crypto";
import { desc, eq, and, sql } from "drizzle-orm";
import { getDb } from "./index.js";
import { auditLogs } from "./schema.js";
function logAuditEntry(entry) {
  try {
    const db = getDb();
    db.insert(auditLogs).values({
      id: randomUUID(),
      agentName: entry.agentName,
      toolName: entry.toolName,
      args: entry.args ? String(entry.args).slice(0, 5e3) : null,
      result: entry.result ? String(entry.result).slice(0, 2e3) : null,
      policy: entry.policy,
      decision: entry.decision,
      threadId: entry.threadId || null,
      durationMs: entry.durationMs || null,
      createdAt: Date.now()
    }).run();
  } catch (err) {
    console.error("[audit] Failed to log entry:", err);
  }
}
function getAuditLogs({ page = 1, limit = 50, agentName, toolName, decision } = {}) {
  const db = getDb();
  const conditions = [];
  if (agentName) conditions.push(eq(auditLogs.agentName, agentName));
  if (toolName) conditions.push(eq(auditLogs.toolName, toolName));
  if (decision) conditions.push(eq(auditLogs.decision, decision));
  let query = db.select().from(auditLogs);
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  const offset = (page - 1) * limit;
  return query.orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset).all();
}
function getAuditStats() {
  const db = getDb();
  return db.select({
    decision: auditLogs.decision,
    count: sql`COUNT(*)`
  }).from(auditLogs).groupBy(auditLogs.decision).all();
}
export {
  getAuditLogs,
  getAuditStats,
  logAuditEntry
};
