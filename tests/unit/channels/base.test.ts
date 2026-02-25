import { describe, it, expect, beforeEach, vi } from 'vitest';

let ChannelAdapter;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../../lib/channels/base.js');
  ChannelAdapter = mod.ChannelAdapter || mod.default;
});

describe('ChannelAdapter', () => {
  describe('constructor', () => {
    it('defaults channelConfig to empty object', () => {
      const adapter = new ChannelAdapter();
      expect(adapter.channelConfig).toEqual({});
    });

    it('stores channelConfig when provided', () => {
      const config = { name: 'test', policies: { dm: 'open' } };
      const adapter = new ChannelAdapter(config);
      expect(adapter.channelConfig).toBe(config);
    });
  });

  describe('checkPolicy', () => {
    it('allows when no policies configured', () => {
      const adapter = new ChannelAdapter({});
      const result = adapter.checkPolicy({ senderId: '123', isGroup: false });
      expect(result).toEqual({ allowed: true });
    });

    it('allows DM when policy is open', () => {
      const adapter = new ChannelAdapter({ policies: { dm: 'open' } });
      const result = adapter.checkPolicy({ senderId: '123', isGroup: false });
      expect(result).toEqual({ allowed: true });
    });

    it('allows DM when sender is in allowlist', () => {
      const adapter = new ChannelAdapter({
        policies: { dm: 'allowlist', allowFrom: ['123', '456'] },
      });
      const result = adapter.checkPolicy({ senderId: '123', isGroup: false });
      expect(result).toEqual({ allowed: true });
    });

    it('blocks DM when sender not in allowlist', () => {
      const adapter = new ChannelAdapter({
        policies: { dm: 'allowlist', allowFrom: ['456'] },
      });
      const result = adapter.checkPolicy({ senderId: '123', isGroup: false });
      expect(result).toEqual({ allowed: false, reason: 'Sender not in DM allowlist' });
    });

    it('allows group when policy is open', () => {
      const adapter = new ChannelAdapter({ policies: { group: 'open' } });
      const result = adapter.checkPolicy({ senderId: '123', isGroup: true });
      expect(result).toEqual({ allowed: true });
    });

    it('blocks group when disabled', () => {
      const adapter = new ChannelAdapter({ policies: { group: 'disabled' } });
      const result = adapter.checkPolicy({ senderId: '123', isGroup: true });
      expect(result).toEqual({
        allowed: false,
        reason: 'Group messages are disabled for this channel',
      });
    });

    it('allows group when sender in groupAllowFrom', () => {
      const adapter = new ChannelAdapter({
        policies: { group: 'allowlist', groupAllowFrom: ['123', '789'] },
      });
      const result = adapter.checkPolicy({ senderId: '123', isGroup: true });
      expect(result).toEqual({ allowed: true });
    });

    it('blocks group when sender not in groupAllowFrom', () => {
      const adapter = new ChannelAdapter({
        policies: { group: 'allowlist', groupAllowFrom: ['789'] },
      });
      const result = adapter.checkPolicy({ senderId: '123', isGroup: true });
      expect(result).toEqual({ allowed: false, reason: 'Sender not in group allowlist' });
    });
  });

  describe('receive', () => {
    it('throws not implemented', async () => {
      const adapter = new ChannelAdapter();
      const request = new Request('http://localhost');
      await expect(adapter.receive(request)).rejects.toThrow('Not implemented');
    });
  });

  describe('sendResponse', () => {
    it('throws not implemented', async () => {
      const adapter = new ChannelAdapter();
      await expect(adapter.sendResponse('thread-1', 'hello')).rejects.toThrow('Not implemented');
    });
  });

  describe('acknowledge', () => {
    it('is a no-op and does not throw', async () => {
      const adapter = new ChannelAdapter();
      await expect(adapter.acknowledge({ channelId: 'test' })).resolves.toBeUndefined();
    });
  });

  describe('startProcessingIndicator', () => {
    it('returns a stop function', () => {
      const adapter = new ChannelAdapter();
      const stop = adapter.startProcessingIndicator({ channelId: 'test' });
      expect(typeof stop).toBe('function');
      // calling stop should not throw
      stop();
    });
  });

  describe('supportsStreaming', () => {
    it('returns false', () => {
      const adapter = new ChannelAdapter();
      expect(adapter.supportsStreaming).toBe(false);
    });
  });

  describe('supportsChunkedDelivery', () => {
    it('returns false', () => {
      const adapter = new ChannelAdapter();
      expect(adapter.supportsChunkedDelivery).toBe(false);
    });
  });
});
