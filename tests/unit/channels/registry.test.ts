import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '{}'),
  existsSync: vi.fn(() => false),
}));

vi.mock('../../../lib/paths.js', () => ({
  resolveFromProject: vi.fn((...args: string[]) => args.join('/')),
}));

vi.mock('../../../lib/channels/telegram.js', () => ({
  TelegramAdapter: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    channelConfig: config,
    type: 'telegram',
  })),
}));

let ChannelRegistry: any;
let getChannelRegistry: any;

beforeEach(async () => {
  vi.resetModules();
  delete (globalThis as any).__mantisChannelRegistry;

  // Re-apply mocks after resetModules
  vi.doMock('fs', () => ({
    readFileSync: vi.fn(() => '{}'),
    existsSync: vi.fn(() => false),
  }));
  vi.doMock('../../../lib/paths.js', () => ({
    resolveFromProject: vi.fn((...args: string[]) => args.join('/')),
  }));
  vi.doMock('../../../lib/channels/telegram.js', () => ({
    TelegramAdapter: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
      channelConfig: config,
      type: 'telegram',
    })),
  }));

  const mod = await import('../../../lib/channels/registry.js');
  ChannelRegistry = mod.ChannelRegistry;
  getChannelRegistry = mod.getChannelRegistry;
});

function makeConfig(id: string, webhookPath: string) {
  return { type: 'test', enabled: true, webhook_path: webhookPath, id, config: {} } as any;
}

describe('ChannelRegistry', () => {
  it('register + getById returns the registered entry with adapter', () => {
    const registry = new ChannelRegistry();
    const adapter = { type: 'test' } as any;
    registry.register('my-channel', makeConfig('my-channel', '/api/my-channel/webhook'), adapter);
    const entry = registry.getById('my-channel');
    expect(entry).toBeDefined();
    expect(entry.adapter).toBe(adapter);
  });

  it('register + getByRoute returns the registered entry with adapter', () => {
    const registry = new ChannelRegistry();
    const adapter = { type: 'test' } as any;
    registry.register('my-channel', makeConfig('my-channel', '/api/my-channel/webhook'), adapter);
    const entry = registry.getByRoute('/api/my-channel/webhook');
    expect(entry).toBeDefined();
    expect(entry.adapter).toBe(adapter);
  });

  it('getByRoute returns undefined for unknown route', () => {
    const registry = new ChannelRegistry();
    expect(registry.getByRoute('/api/unknown/webhook')).toBeUndefined();
  });

  it('getById returns undefined for unknown id', () => {
    const registry = new ChannelRegistry();
    expect(registry.getById('nonexistent')).toBeUndefined();
  });

  it('getWebhookPaths returns registered paths', () => {
    const registry = new ChannelRegistry();
    const adapter1 = { type: 'a' } as any;
    const adapter2 = { type: 'b' } as any;
    registry.register('ch1', makeConfig('ch1', '/api/ch1/webhook'), adapter1);
    registry.register('ch2', makeConfig('ch2', '/api/ch2/webhook'), adapter2);
    const paths = registry.getWebhookPaths();
    expect(paths).toContain('/api/ch1/webhook');
    expect(paths).toContain('/api/ch2/webhook');
    expect(paths).toHaveLength(2);
  });

  it('getAll returns all channels', () => {
    const registry = new ChannelRegistry();
    const adapter1 = { type: 'a' } as any;
    const adapter2 = { type: 'b' } as any;
    registry.register('ch1', makeConfig('ch1', '/api/ch1/webhook'), adapter1);
    registry.register('ch2', makeConfig('ch2', '/api/ch2/webhook'), adapter2);
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ch1', type: 'test', enabled: true, webhook_path: '/api/ch1/webhook' }),
        expect.objectContaining({ id: 'ch2', type: 'test', enabled: true, webhook_path: '/api/ch2/webhook' }),
      ])
    );
  });

  it('size returns count of registered channels', () => {
    const registry = new ChannelRegistry();
    expect(registry.size).toBe(0);
    registry.register('ch1', makeConfig('ch1', '/api/ch1/webhook'), { type: 'a' } as any);
    expect(registry.size).toBe(1);
    registry.register('ch2', makeConfig('ch2', '/api/ch2/webhook'), { type: 'b' } as any);
    expect(registry.size).toBe(2);
  });
});

describe('getChannelRegistry', () => {
  it('returns the same singleton instance on repeated calls', () => {
    const first = getChannelRegistry();
    const second = getChannelRegistry();
    expect(first).toBe(second);
  });
});
