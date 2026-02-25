'use strict';

import { logAuditEntry, getAuditLogs, getAuditStats } from '../db/audit.js';
import type { AuditLogEntry, ToolPolicyDecision } from '../types.js';

/**
 * Log a tool invocation to the audit log. Fire-and-forget.
 */
export function logToolInvocation(entry: AuditLogEntry): void {
  logAuditEntry(entry);
}

// Re-export query functions for convenience
export { getAuditLogs, getAuditStats };
