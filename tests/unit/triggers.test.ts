import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue('[]'),
  },
}));

vi.mock('../../lib/paths.js', () => ({
  triggersFile: '/test/config/TRIGGERS.json',
  triggersDir: '/test/triggers',
}));

const mockExecuteAction = vi.fn().mockResolvedValue('ok');
vi.mock('../../lib/actions.js', () => ({
  executeAction: (...args: any[]) => mockExecuteAction(...args),
}));

const sampleTriggers = [
  {
    name: 'test-trigger',
    watch_path: '/test/path',
    enabled: true,
    actions: [{ type: 'command', command: 'echo {{body.msg}}' }],
  },
  {
    name: 'disabled-trigger',
    watch_path: '/disabled/path',
    enabled: false,
    actions: [{ type: 'command', command: 'echo disabled' }],
  },
  {
    name: 'multi-action-trigger',
    watch_path: '/multi/path',
    enabled: true,
    actions: [
      { type: 'command', command: 'echo first' },
      { type: 'webhook', url: 'https://example.com/hook', method: 'POST' },
    ],
  },
];

describe('triggers', () => {
  let loadTriggers: Function;
  let fs: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    fs = (await import('fs')).default;
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('[]');

    mockExecuteAction.mockResolvedValue('ok');

    const mod = await import('../../lib/triggers.js');
    loadTriggers = mod.loadTriggers;
  });

  describe('loadTriggers with no TRIGGERS.json', () => {
    it('returns empty triggerMap when no file exists', () => {
      fs.existsSync.mockReturnValue(false);

      const { triggerMap } = loadTriggers();

      expect(triggerMap).toBeDefined();
      expect(triggerMap.size).toBe(0);
    });

    it('returns a no-op fireTriggers function when no file exists', async () => {
      fs.existsSync.mockReturnValue(false);

      const { fireTriggers } = loadTriggers();

      // Should not throw and should not call executeAction
      fireTriggers('/any/path', {});
      await new Promise(r => setTimeout(r, 50));

      expect(mockExecuteAction).not.toHaveBeenCalled();
    });
  });

  describe('loadTriggers with TRIGGERS.json', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(sampleTriggers));
    });

    it('parses triggers and builds a map keyed by watch_path', () => {
      const { triggerMap } = loadTriggers();

      expect(triggerMap.get('/test/path')).toBeDefined();
      expect(triggerMap.get('/test/path')).toHaveLength(1);
      expect(triggerMap.get('/test/path')[0].name).toBe('test-trigger');
    });

    it('skips disabled triggers', () => {
      const { triggerMap } = loadTriggers();

      expect(triggerMap.has('/disabled/path')).toBe(false);
    });

    it('includes multi-action triggers', () => {
      const { triggerMap } = loadTriggers();

      expect(triggerMap.get('/multi/path')).toBeDefined();
      expect(triggerMap.get('/multi/path')[0].actions).toHaveLength(2);
    });
  });

  describe('fireTriggers', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(sampleTriggers));
    });

    it('fires actions for matching watch_path', async () => {
      const { fireTriggers } = loadTriggers();

      fireTriggers('/test/path', { msg: 'hello' }, {}, {});
      await new Promise(r => setTimeout(r, 50));

      expect(mockExecuteAction).toHaveBeenCalled();
    });

    it('does nothing for unmatched paths', async () => {
      const { fireTriggers } = loadTriggers();

      fireTriggers('/nonexistent/path', {}, {}, {});
      await new Promise(r => setTimeout(r, 50));

      expect(mockExecuteAction).not.toHaveBeenCalled();
    });

    it('fires all actions for a multi-action trigger', async () => {
      const { fireTriggers } = loadTriggers();

      fireTriggers('/multi/path', {}, {}, {});
      await new Promise(r => setTimeout(r, 50));

      expect(mockExecuteAction).toHaveBeenCalledTimes(2);
    });
  });
});
