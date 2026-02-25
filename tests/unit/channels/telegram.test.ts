import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/tools/telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  downloadFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('test'), filename: 'audio.ogg' }),
  reactToMessage: vi.fn().mockResolvedValue(undefined),
  startTypingIndicator: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('../../../lib/tools/openai.js', () => ({
  isWhisperEnabled: vi.fn().mockReturnValue(false),
  transcribeAudio: vi.fn().mockResolvedValue('transcribed text'),
}));

function createTelegramRequest(update: object, secret?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (secret) headers.set('x-telegram-bot-api-secret-token', secret);
  return new Request('http://localhost/api/telegram/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify(update),
  });
}

const textUpdate = {
  message: {
    message_id: 1,
    chat: { id: 12345, type: 'private' },
    from: { id: 67890 },
    text: 'Hello bot',
  },
};

describe('TelegramAdapter', () => {
  let TelegramAdapter: any;
  let sendMessage: any;
  let reactToMessage: any;
  let startTypingIndicator: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
    process.env.TELEGRAM_CHAT_ID = '12345';
    delete process.env.TELEGRAM_VERIFICATION;

    const telegramTools = await import('../../../lib/tools/telegram.js');
    sendMessage = telegramTools.sendMessage;
    reactToMessage = telegramTools.reactToMessage;
    startTypingIndicator = telegramTools.startTypingIndicator;

    // Re-set mock implementations after clearAllMocks
    vi.mocked(reactToMessage).mockResolvedValue(undefined);
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    vi.mocked(startTypingIndicator).mockReturnValue(() => {});

    const mod = await import('../../../lib/channels/telegram.js');
    TelegramAdapter = mod.TelegramAdapter;
  });

  describe('receive', () => {
    it('returns null when webhook secret is missing from env', async () => {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      const adapter = new TelegramAdapter('bot-token');
      const request = createTelegramRequest(textUpdate, 'test-secret');
      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });

    it('returns null when header secret does not match', async () => {
      const adapter = new TelegramAdapter('bot-token');
      const request = createTelegramRequest(textUpdate, 'wrong-secret');
      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });

    it('returns null when no message in update', async () => {
      const adapter = new TelegramAdapter('bot-token');
      const request = createTelegramRequest({}, 'test-secret');
      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });

    it('returns null when chat ID does not match env', async () => {
      const adapter = new TelegramAdapter('bot-token');
      const update = {
        message: {
          message_id: 1,
          chat: { id: 99999, type: 'private' },
          from: { id: 67890 },
          text: 'Hello bot',
        },
      };
      const request = createTelegramRequest(update, 'test-secret');
      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });

    it('parses text message correctly', async () => {
      const adapter = new TelegramAdapter('bot-token');
      const request = createTelegramRequest(textUpdate, 'test-secret');
      const result = await adapter.receive(request);

      expect(result).not.toBeNull();
      expect(result.threadId).toBe('12345');
      expect(result.text).toBe('Hello bot');
      expect(result.attachments).toEqual([]);
      expect(result.metadata).toBeDefined();
    });

    it('returns null when TELEGRAM_CHAT_ID is not set', async () => {
      delete process.env.TELEGRAM_CHAT_ID;
      const adapter = new TelegramAdapter('bot-token');
      const request = createTelegramRequest(textUpdate, 'test-secret');
      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });
  });

  describe('sendResponse', () => {
    it('calls sendMessage with correct args', async () => {
      const adapter = new TelegramAdapter('bot-token');
      await adapter.sendResponse('12345', 'Hello user');

      expect(sendMessage).toHaveBeenCalledWith(
        'bot-token',
        '12345',
        'Hello user',
      );
    });
  });

  describe('acknowledge', () => {
    it('calls reactToMessage', async () => {
      const adapter = new TelegramAdapter('bot-token');
      const metadata = { chatId: '12345', messageId: 1 };
      await adapter.acknowledge(metadata);

      expect(reactToMessage).toHaveBeenCalled();
    });
  });

  describe('startProcessingIndicator', () => {
    it('calls startTypingIndicator', () => {
      const adapter = new TelegramAdapter('bot-token');
      const metadata = { chatId: '12345', messageId: 1 };
      adapter.startProcessingIndicator(metadata);

      expect(startTypingIndicator).toHaveBeenCalled();
    });
  });

  describe('supportsStreaming', () => {
    it('returns false', () => {
      const adapter = new TelegramAdapter('bot-token');
      expect(adapter.supportsStreaming).toBe(false);
    });
  });
});
