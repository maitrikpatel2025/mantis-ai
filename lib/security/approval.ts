'use strict';

import { getDb } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { emitEvent } from '../events/bus.js';
import type { ApprovalRequest } from '../types.js';

/**
 * Create an approval request for a tool execution.
 */
export function createApprovalRequest(agent: string, tool: string, args: Record<string, unknown>): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();

  db.insert(settings).values({
    id,
    type: 'approval',
    key: `approval:${id}`,
    value: JSON.stringify({ agent, tool, args, status: 'pending', createdAt: now }),
    createdAt: now,
    updatedAt: now,
  }).run();

  emitEvent('approval:created', { id, agent, tool, args });
  return id;
}

/**
 * Wait for an approval decision, polling at 2s intervals.
 */
export async function waitForApproval(id: string, timeoutMs: number = 300000): Promise<'approved' | 'denied' | 'timeout'> {
  const db = getDb();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const row = db.select().from(settings).where(eq(settings.id, id)).get();
    if (row) {
      const data = JSON.parse(row.value);
      if (data.status === 'approved') return 'approved';
      if (data.status === 'denied') return 'denied';
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return 'timeout';
}

/**
 * Approve an approval request.
 */
export function approveRequest(id: string): void {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.id, id)).get();
  if (!row) return;
  const data = JSON.parse(row.value);
  data.status = 'approved';
  db.update(settings).set({ value: JSON.stringify(data), updatedAt: Date.now() }).where(eq(settings.id, id)).run();
  emitEvent('approval:resolved', { id, status: 'approved' });
}

/**
 * Deny an approval request.
 */
export function denyRequest(id: string): void {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.id, id)).get();
  if (!row) return;
  const data = JSON.parse(row.value);
  data.status = 'denied';
  db.update(settings).set({ value: JSON.stringify(data), updatedAt: Date.now() }).where(eq(settings.id, id)).run();
  emitEvent('approval:resolved', { id, status: 'denied' });
}

/**
 * Get all pending approval requests.
 */
export function getPendingApprovals(): ApprovalRequest[] {
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(eq(settings.type, 'approval'))
    .all();

  return rows
    .map((row) => {
      const data = JSON.parse(row.value);
      return { id: row.id, ...data } as ApprovalRequest;
    })
    .filter((r) => r.status === 'pending');
}
