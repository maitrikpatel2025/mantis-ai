import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';

const mockFiles: Record<string, string> = {};

vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => p in mockFiles,
    readFileSync: (p: string) => {
      if (p in mockFiles) return mockFiles[p];
      throw new Error(`ENOENT: ${p}`);
    },
    readdirSync: () => [],
  },
  existsSync: (p: string) => p in mockFiles,
  readFileSync: (p: string) => {
    if (p in mockFiles) return mockFiles[p];
    throw new Error(`ENOENT: ${p}`);
  },
  readdirSync: () => [],
}));

vi.mock('../../../lib/paths.js', () => ({
  PROJECT_ROOT: '/test-project',
  piSkillsDir: '/test-project/.pi/skills',
}));

const { render_md } = await import('../../../lib/utils/render-md.js');

describe('render_md', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockFiles)) delete mockFiles[key];
  });

  it('returns empty string for non-existent file', () => {
    const result = render_md('/test-project/missing.md');

    expect(result).toBe('');
  });

  it('reads and returns file content', () => {
    mockFiles[path.resolve('/test-project/simple.md')] = 'Hello World';

    const result = render_md(path.resolve('/test-project/simple.md'));

    expect(result).toBe('Hello World');
  });

  it('resolves {{datetime}} variable', () => {
    mockFiles[path.resolve('/test-project/dated.md')] = 'Today is {{datetime}}';

    const result = render_md(path.resolve('/test-project/dated.md'));

    expect(result).toMatch(/Today is \d{4}-\d{2}-\d{2}/);
  });

  it('resolves {{other.md}} includes', () => {
    mockFiles[path.resolve('/test-project/main.md')] = 'Before {{sub.md}} After';
    mockFiles[path.resolve('/test-project/sub.md')] = 'INCLUDED';

    const result = render_md(path.resolve('/test-project/main.md'));

    expect(result).toBe('Before INCLUDED After');
  });

  it('detects circular includes and returns empty', () => {
    mockFiles[path.resolve('/test-project/a.md')] = '{{b.md}}';
    mockFiles[path.resolve('/test-project/b.md')] = '{{a.md}}';

    const result = render_md(path.resolve('/test-project/a.md'));

    expect(result).toBe('');
  });

  it('leaves unresolvable includes as-is when file does not exist', () => {
    mockFiles[path.resolve('/test-project/parent.md')] = 'Start {{nonexistent.md}} End';

    const result = render_md(path.resolve('/test-project/parent.md'));

    expect(result).toContain('{{nonexistent.md}}');
  });

  it('handles nested includes', () => {
    mockFiles[path.resolve('/test-project/top.md')] = 'A {{middle.md}} C';
    mockFiles[path.resolve('/test-project/middle.md')] = 'B1 {{bottom.md}} B2';
    mockFiles[path.resolve('/test-project/bottom.md')] = 'DEEP';

    const result = render_md(path.resolve('/test-project/top.md'));

    expect(result).toBe('A B1 DEEP B2 C');
  });
});
