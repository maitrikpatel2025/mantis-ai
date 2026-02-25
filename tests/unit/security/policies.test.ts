import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/db.js';

let testDb: ReturnType<typeof createTestDb>;

vi.mock('../../../lib/db/index.js', () => ({
  getDb: () => testDb.db,
}));

const { getToolPolicy, setToolPolicy, getAllPolicies } = await import('../../../lib/security/policies.js');

describe('Security: Policies', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it('getToolPolicy returns "allow" by default', () => {
    expect(getToolPolicy('agent-1', 'run_command')).toBe('allow');
  });

  it('setToolPolicy and getToolPolicy roundtrip', () => {
    setToolPolicy('agent-1', 'run_command', 'deny');
    expect(getToolPolicy('agent-1', 'run_command')).toBe('deny');
  });

  it('wildcard agent policy applies', () => {
    setToolPolicy('*', 'run_command', 'ask');
    expect(getToolPolicy('any-agent', 'run_command')).toBe('ask');
  });

  it('specific agent overrides wildcard', () => {
    setToolPolicy('*', 'run_command', 'deny');
    setToolPolicy('agent-1', 'run_command', 'allow');
    expect(getToolPolicy('agent-1', 'run_command')).toBe('allow');
    expect(getToolPolicy('other-agent', 'run_command')).toBe('deny');
  });

  it('setToolPolicy updates existing policy', () => {
    setToolPolicy('agent-1', 'run_command', 'deny');
    setToolPolicy('agent-1', 'run_command', 'allow');
    expect(getToolPolicy('agent-1', 'run_command')).toBe('allow');
  });

  it('getAllPolicies returns all policies', () => {
    setToolPolicy('agent-1', 'run_command', 'deny');
    setToolPolicy('*', 'file_write', 'ask');
    const policies = getAllPolicies();
    expect(policies).toHaveLength(2);
    expect(policies.find(p => p.agent === 'agent-1')?.policy).toBe('deny');
    expect(policies.find(p => p.tool === 'file_write')?.policy).toBe('ask');
  });
});
