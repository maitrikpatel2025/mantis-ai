import { describe, it, expect } from 'vitest';
import { createTestDb } from '../../helpers/db.js';
import * as schema from '../../../lib/db/schema.js';

describe('Database Schema', () => {
  it('creates all tables without error', () => {
    const { db, sqlite } = createTestDb();
    // Verify tables exist by querying sqlite_master
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('chats');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('notifications');
    expect(tableNames).toContain('subscriptions');
    expect(tableNames).toContain('usage_logs');
    expect(tableNames).toContain('jobs');
    expect(tableNames).toContain('memories');
    expect(tableNames).toContain('cron_runs');
    expect(tableNames).toContain('settings');
    expect(tableNames).toContain('audit_logs');

    sqlite.close();
  });

  it('exports all table definitions', () => {
    expect(schema.users).toBeDefined();
    expect(schema.chats).toBeDefined();
    expect(schema.messages).toBeDefined();
    expect(schema.notifications).toBeDefined();
    expect(schema.subscriptions).toBeDefined();
    expect(schema.usageLogs).toBeDefined();
    expect(schema.jobs).toBeDefined();
    expect(schema.memories).toBeDefined();
    expect(schema.cronRuns).toBeDefined();
    expect(schema.settings).toBeDefined();
    expect(schema.auditLogs).toBeDefined();
  });
});
