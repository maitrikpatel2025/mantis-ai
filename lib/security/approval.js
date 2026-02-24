'use strict';

import { getDb } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq, and, like } from 'drizzle-orm';
import { emitEvent } from '../events/bus.js';

/**
 * Create an approval request for a tool execution.
 * @param {string} agent
 * @param {string} tool
 * @param {object} args
 * @returns {string} approval request ID
 */
export function createApprovalRequest(agent, tool, args) {
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
 * @param {string} id - Approval request ID
 * @param {number} timeoutMs - Max wait time (default 5 minutes)
 * @returns {Promise<'approved'|'denied'|'timeout'>}
 */
export async function waitForApproval(id, timeoutMs = 300000) {
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
 * @param {string} id
 */
export function approveRequest(id) {
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
 * @param {string} id
 */
export function denyRequest(id) {
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
 * @returns {Array<{ id: string, agent: string, tool: string, args: object, createdAt: number }>}
 */
export function getPendingApprovals() {
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(eq(settings.type, 'approval'))
    .all();

  return rows
    .map((row) => {
      const data = JSON.parse(row.value);
      return { id: row.id, ...data };
    })
    .filter((r) => r.status === 'pending');
}
