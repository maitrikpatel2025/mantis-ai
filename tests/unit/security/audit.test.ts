import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/db.js';

let testDb: ReturnType<typeof createTestDb>;

vi.mock('../../../lib/db/index.js', () => ({
  getDb: () => testDb.db,
}));

const { logAuditEntry, getAuditLogs, getAuditStats } = await import('../../../lib/db/audit.js');

describe('Security: Audit Logging', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it('logAuditEntry inserts a record', () => {
    logAuditEntry({
      agentName: 'main',
      toolName: 'run_command',
      args: JSON.stringify({ command: 'ls' }),
      policy: 'allow',
      decision: 'executed',
    });
    const logs = getAuditLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].toolName).toBe('run_command');
    expect(logs[0].decision).toBe('executed');
  });

  it('getAuditLogs supports pagination', () => {
    for (let i = 0; i < 5; i++) {
      logAuditEntry({
        agentName: 'main',
        toolName: `tool_${i}`,
        policy: 'allow',
        decision: 'executed',
      });
    }
    const page1 = getAuditLogs({ page: 1, limit: 2 });
    const page2 = getAuditLogs({ page: 2, limit: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
  });

  it('getAuditLogs filters by decision', () => {
    logAuditEntry({ agentName: 'main', toolName: 'tool1', policy: 'allow', decision: 'executed' });
    logAuditEntry({ agentName: 'main', toolName: 'tool2', policy: 'deny', decision: 'blocked' });
    const blocked = getAuditLogs({ decision: 'blocked' });
    expect(blocked).toHaveLength(1);
    expect(blocked[0].toolName).toBe('tool2');
  });

  it('getAuditStats returns counts by decision', () => {
    logAuditEntry({ agentName: 'main', toolName: 'tool1', policy: 'allow', decision: 'executed' });
    logAuditEntry({ agentName: 'main', toolName: 'tool2', policy: 'allow', decision: 'executed' });
    logAuditEntry({ agentName: 'main', toolName: 'tool3', policy: 'deny', decision: 'blocked' });
    const stats = getAuditStats();
    const executed = stats.find(s => s.decision === 'executed');
    const blocked = stats.find(s => s.decision === 'blocked');
    expect(executed?.count).toBe(2);
    expect(blocked?.count).toBe(1);
  });

  it('truncates long args and result', () => {
    const longArgs = 'x'.repeat(10000);
    logAuditEntry({
      agentName: 'main',
      toolName: 'tool1',
      args: longArgs,
      result: longArgs,
      policy: 'allow',
      decision: 'executed',
    });
    const logs = getAuditLogs();
    expect(logs[0].args!.length).toBeLessThanOrEqual(5000);
    expect(logs[0].result!.length).toBeLessThanOrEqual(2000);
  });
});
