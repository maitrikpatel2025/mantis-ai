import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetRelevantMemories = vi.fn();
const mockInsertMemories = vi.fn();

vi.mock('../../../lib/db/memories.js', () => ({
  getRelevantMemories: (...args: any[]) => mockGetRelevantMemories(...args),
  insertMemories: (...args: any[]) => mockInsertMemories(...args),
}));

const { enrichPromptWithMemory } = await import('../../../lib/memory/index.js');

describe('enrichPromptWithMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns original prompt when no memories found', () => {
    mockGetRelevantMemories.mockReturnValue([]);

    const prompt = 'Build a landing page';
    const result = enrichPromptWithMemory(prompt);

    expect(result).toBe(prompt);
  });

  it('prepends memory block when memories exist', () => {
    mockGetRelevantMemories.mockReturnValue([
      { category: 'project', content: 'Uses React and TypeScript' },
      { category: 'skill', content: 'Prefers functional components' },
    ]);

    const prompt = 'Build a landing page';
    const result = enrichPromptWithMemory(prompt);

    expect(result).toMatch(/^## Context from Previous Jobs/);
    expect(result).toContain('1. [project] Uses React and TypeScript');
    expect(result).toContain('2. [skill] Prefers functional components');
    expect(result).toContain(prompt);
  });

  it('returns original prompt on error', () => {
    mockGetRelevantMemories.mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const prompt = 'Build a landing page';
    const result = enrichPromptWithMemory(prompt);

    expect(result).toBe(prompt);
  });

  it('calls getRelevantMemories with prompt and limit 5', () => {
    mockGetRelevantMemories.mockReturnValue([]);

    const prompt = 'Build a landing page';
    enrichPromptWithMemory(prompt);

    expect(mockGetRelevantMemories).toHaveBeenCalledWith(prompt, { limit: 5 });
  });
});
