'use strict';

import { getDb } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq, and, like } from 'drizzle-orm';
import type { ToolPolicyDecision, ToolPolicy } from '../types.js';

/**
 * Get the tool execution policy for a given agent and tool.
 */
export function getToolPolicy(agent: string, tool: string): ToolPolicyDecision {
  const db = getDb();

  // Try specific agent+tool policy first
  const specific = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'security'), eq(settings.key, `tool_policy:${agent}:${tool}`)))
    .get();
  if (specific) return specific.value as ToolPolicyDecision;

  // Try wildcard agent policy
  const wildcard = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'security'), eq(settings.key, `tool_policy:*:${tool}`)))
    .get();
  if (wildcard) return wildcard.value as ToolPolicyDecision;

  return 'allow';
}

/**
 * Set a tool execution policy.
 */
export function setToolPolicy(agent: string, tool: string, policy: ToolPolicyDecision): void {
  const db = getDb();
  const key = `tool_policy:${agent}:${tool}`;
  const now = Date.now();

  const existing = db
    .select()
    .from(settings)
    .where(and(eq(settings.type, 'security'), eq(settings.key, key)))
    .get();

  if (existing) {
    db.update(settings).set({ value: policy, updatedAt: now }).where(eq(settings.id, existing.id)).run();
  } else {
    db.insert(settings).values({
      id: crypto.randomUUID(),
      type: 'security',
      key,
      value: policy,
      createdAt: now,
      updatedAt: now,
    }).run();
  }
}

/**
 * Get all tool policies.
 */
export function getAllPolicies(): ToolPolicy[] {
  const db = getDb();
  const rows = db
    .select()
    .from(settings)
    .where(like(settings.key, 'tool_policy:%'))
    .all();

  return rows.map((row) => {
    const parts = row.key.split(':');
    return { agent: parts[1] || '*', tool: parts[2] || '', policy: row.value as ToolPolicyDecision };
  });
}
