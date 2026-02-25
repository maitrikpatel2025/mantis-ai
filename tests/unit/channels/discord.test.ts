import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/tools/discord.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  downloadAttachment: vi.fn().mockResolvedValue(Buffer.from('test')),
  addReaction: vi.fn().mockResolvedValue(undefined),
  triggerTyping: vi.fn().mockResolvedValue(undefined),
  deferInteraction: vi.fn().mockResolvedValue(undefined),
  editDeferredResponse: vi.fn().mockResolvedValue(undefined),
  markdownToDiscord: vi.fn((text: string) => text),
}));

vi.mock('../../../lib/tools/openai.js', () => ({
  isWhisperEnabled: vi.fn().mockReturnValue(false),
  transcribeAudio: vi.fn().mockResolvedValue('transcribed text'),
}));

const { DiscordAdapter } = await import('../../../lib/channels/discord.js');
const discordTools = await import('../../../lib/tools/discord.js');

function createDiscordRequest(body: object): Request {
  return new Request('http://localhost/api/discord/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature-ed25519': 'fake-sig',
      'x-signature-timestamp': '1234567890',
    },
    body: JSON.stringify(body),
  });
}

describe('DiscordAdapter', () => {
  let adapter: InstanceType<typeof DiscordAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set mock implementations after clearAllMocks
    vi.mocked(discordTools.deferInteraction).mockResolvedValue(undefined);
    vi.mocked(discordTools.addReaction).mockResolvedValue(undefined);
    vi.mocked(discordTools.sendMessage).mockResolvedValue(undefined);
    vi.mocked(discordTools.editDeferredResponse).mockResolvedValue(undefined);
    vi.mocked(discordTools.triggerTyping).mockResolvedValue(undefined);
    vi.mocked(discordTools.markdownToDiscord).mockImplementation((text: string) => text);

    adapter = new DiscordAdapter('bot-token', 'app-id', 'public-key');
    // Bypass signature verification in tests
    vi.spyOn(adapter, 'verifySignature').mockResolvedValue(true);
  });

  describe('receive', () => {
    it('returns null when signature is invalid', async () => {
      vi.spyOn(adapter, 'verifySignature').mockResolvedValue(false);

      const request = createDiscordRequest({ type: 2, channel_id: 'ch-1', data: { name: 'ask', options: [{ value: 'hi' }] } });
      const result = await adapter.receive(request);

      expect(result).toBeNull();
    });

    it('handles PING interaction (type 1)', async () => {
      const request = createDiscordRequest({ type: 1 });
      const result = await adapter.receive(request);

      expect(result).toEqual({ _pong: true });
    });

    it('handles APPLICATION_COMMAND interaction (type 2)', async () => {
      const request = createDiscordRequest({
        type: 2,
        channel_id: 'ch-123',
        id: 'int-123',
        token: 'int-token',
        guild_id: 'guild-1',
        member: { user: { id: 'user-123' } },
        data: { name: 'ask', options: [{ value: 'Hello bot' }] },
      });

      const result = await adapter.receive(request);

      expect(result).not.toBeNull();
      expect(result.threadId).toBe('ch-123');
      expect(result.text).toBe('Hello bot');
      expect(result.metadata.isInteraction).toBe(true);
      expect(result.metadata.interactionId).toBe('int-123');
      expect(result.metadata.interactionToken).toBe('int-token');
    });

    it('handles MESSAGE_CREATE event', async () => {
      const request = createDiscordRequest({
        t: 'MESSAGE_CREATE',
        d: {
          channel_id: 'ch-123',
          id: 'msg-123',
          guild_id: 'guild-1',
          author: { id: 'user-123' },
          content: 'Hello from Discord',
        },
      });

      const result = await adapter.receive(request);

      expect(result).not.toBeNull();
      expect(result.threadId).toBe('ch-123');
      expect(result.text).toBe('Hello from Discord');
    });

    it('ignores bot messages', async () => {
      const request = createDiscordRequest({
        t: 'MESSAGE_CREATE',
        d: {
          channel_id: 'ch-123',
          id: 'msg-123',
          guild_id: 'guild-1',
          author: { id: 'bot-123', bot: true },
          content: 'I am a bot',
        },
      });

      const result = await adapter.receive(request);

      expect(result).toBeNull();
    });

    it('returns null for empty content', async () => {
      const request = createDiscordRequest({
        t: 'MESSAGE_CREATE',
        d: {
          channel_id: 'ch-123',
          id: 'msg-123',
          guild_id: 'guild-1',
          author: { id: 'user-123' },
          content: '',
        },
      });

      const result = await adapter.receive(request);

      expect(result).toBeNull();
    });

    it('checks channel policies for slash commands', async () => {
      const config = {
        policies: {
          dm: 'allowlist',
          allowFrom: ['other-user'],
        },
      };
      const restrictedAdapter = new DiscordAdapter('bot-token', 'app-id', 'public-key', config);
      vi.spyOn(restrictedAdapter, 'verifySignature').mockResolvedValue(true);

      const request = createDiscordRequest({
        type: 2,
        channel_id: 'ch-blocked',
        id: 'int-123',
        token: 'int-token',
        member: { user: { id: 'user-123' } },
        data: { name: 'ask', options: [{ value: 'Hello bot' }] },
      });

      const result = await restrictedAdapter.receive(request);

      expect(result).toBeNull();
    });
  });

  describe('acknowledge', () => {
    it('defers interaction for interaction messages', async () => {
      const metadata = {
        isInteraction: true,
        interactionId: 'int-123',
        interactionToken: 'int-token',
      };

      await adapter.acknowledge(metadata);

      expect(discordTools.deferInteraction).toHaveBeenCalledWith(
        'int-123',
        'int-token',
      );
    });

    it('adds reaction for regular messages', async () => {
      const metadata = {
        isInteraction: false,
        channelId: 'ch-123',
        messageId: 'msg-123',
      };

      await adapter.acknowledge(metadata);

      expect(discordTools.addReaction).toHaveBeenCalledWith(
        'bot-token',
        'ch-123',
        'msg-123',
      );
    });
  });

  describe('sendResponse', () => {
    it('edits deferred response for interaction messages', async () => {
      const metadata = {
        isInteraction: true,
        interactionToken: 'int-token',
      };

      await adapter.sendResponse('ch-123', 'Hello!', metadata);

      expect(discordTools.editDeferredResponse).toHaveBeenCalledWith(
        'app-id',
        'int-token',
        expect.stringContaining('Hello!'),
      );
    });

    it('sends message for regular messages', async () => {
      const metadata = {
        isInteraction: false,
      };

      await adapter.sendResponse('ch-123', 'Hello!', metadata);

      expect(discordTools.sendMessage).toHaveBeenCalledWith(
        'bot-token',
        'ch-123',
        expect.stringContaining('Hello!'),
      );
    });
  });

  describe('supportsStreaming', () => {
    it('returns false', () => {
      expect(adapter.supportsStreaming).toBe(false);
    });
  });
});
