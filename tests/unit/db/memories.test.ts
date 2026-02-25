import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/db.js';
import { TEST_MEMORY } from '../../helpers/fixtures.js';

let testDb: ReturnType<typeof createTestDb>;

vi.mock('../../../lib/db/index.js', () => ({
  getDb: () => testDb.db,
}));

const { createMemory, getMemories, searchMemories, getRelevantMemories, updateMemory, deleteMemory, insertMemories } = await import('../../../lib/db/memories.js');

describe('DB: Memories', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it('createMemory stores a memory', () => {
    const mem = createMemory(TEST_MEMORY);
    expect(mem.id).toBeDefined();
    expect(mem.content).toBe(TEST_MEMORY.content);
    expect(mem.category).toBe(TEST_MEMORY.category);
    expect(mem.relevance).toBe(TEST_MEMORY.relevance);
  });

  it('getMemories returns all memories sorted by relevance', () => {
    createMemory({ content: 'Low relevance', relevance: 1 });
    createMemory({ content: 'High relevance', relevance: 9 });
    const mems = getMemories();
    expect(mems).toHaveLength(2);
    expect(mems[0].relevance).toBeGreaterThanOrEqual(mems[1].relevance);
  });

  it('getMemories filters by category', () => {
    createMemory({ content: 'A', category: 'project' });
    createMemory({ content: 'B', category: 'skill' });
    const project = getMemories({ category: 'project' });
    expect(project).toHaveLength(1);
    expect(project[0].content).toBe('A');
  });

  it('searchMemories finds by content keyword', () => {
    createMemory({ content: 'Uses React and TypeScript' });
    createMemory({ content: 'Uses Python and Django' });
    const results = searchMemories('React');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('React');
  });

  it('getRelevantMemories extracts keywords and matches', () => {
    createMemory({ content: 'The login page uses React components' });
    createMemory({ content: 'Database uses PostgreSQL migrations' });
    const relevant = getRelevantMemories('Fix the React login component');
    expect(relevant.length).toBeGreaterThan(0);
    expect(relevant[0].content).toContain('login');
  });

  it('updateMemory changes fields', () => {
    const mem = createMemory(TEST_MEMORY);
    updateMemory(mem.id, { content: 'Updated content', relevance: 10 });
    const mems = getMemories();
    expect(mems[0].content).toBe('Updated content');
    expect(mems[0].relevance).toBe(10);
  });

  it('deleteMemory removes a memory', () => {
    const mem = createMemory(TEST_MEMORY);
    deleteMemory(mem.id);
    expect(getMemories()).toHaveLength(0);
  });

  it('insertMemories bulk inserts', () => {
    const entries = [
      { content: 'Memory 1', category: 'general' },
      { content: 'Memory 2', category: 'skill' },
      { content: 'Memory 3', category: 'project' },
    ];
    const rows = insertMemories(entries);
    expect(rows).toHaveLength(3);
    expect(getMemories()).toHaveLength(3);
  });
});
