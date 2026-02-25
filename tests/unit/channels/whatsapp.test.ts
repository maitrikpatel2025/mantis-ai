import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('../../../lib/tools/whatsapp.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  downloadMedia: vi.fn().mockResolvedValue({ buffer: Buffer.from('test'), mimeType: 'image/jpeg' }),
  markRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/tools/openai.js', () => ({
  isWhisperEnabled: vi.fn().mockReturnValue(false),
  transcribeAudio: vi.fn().mockResolvedValue('transcribed text'),
}));

const { WhatsAppAdapter } = await import('../../../lib/channels/whatsapp.js');
const whatsappTools = await import('../../../lib/tools/whatsapp.js');

function createWhatsAppSignature(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function createWhatsAppRequest(body: object, appSecret?: string): Request {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (appSecret) {
    headers['x-hub-signature-256'] = createWhatsAppSignature(rawBody, appSecret);
  }
  return new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

const textMessage = {
  entry: [{
    changes: [{
      value: {
        messages: [{
          from: '1234567890',
          id: 'wamid.123',
          type: 'text',
          text: { body: 'Hello from WhatsApp' },
        }],
      },
    }],
  }],
};

describe('WhatsAppAdapter', () => {
  let adapter: InstanceType<typeof WhatsAppAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set mock implementations after clearAllMocks
    vi.mocked(whatsappTools.markRead).mockResolvedValue(undefined);
    vi.mocked(whatsappTools.sendMessage).mockResolvedValue(undefined);
    vi.mocked(whatsappTools.downloadMedia).mockResolvedValue({ buffer: Buffer.from('test'), mimeType: 'image/jpeg' });

    adapter = new WhatsAppAdapter('phone-id', 'access-token', 'test-verify-token', 'app-secret');
  });

  describe('verifySignature', () => {
    it('returns true for valid signature', async () => {
      const body = JSON.stringify(textMessage);
      const signature = createWhatsAppSignature(body, 'app-secret');

      const result = await adapter.verifySignature(body, signature);

      expect(result).toBe(true);
    });

    it('returns false for invalid signature', async () => {
      const body = JSON.stringify(textMessage);
      const signature = 'sha256=invalid';

      const result = await adapter.verifySignature(body, signature);

      expect(result).toBe(false);
    });

    it('returns true when no appSecret configured', async () => {
      const noSecretAdapter = new WhatsAppAdapter('phone-id', 'access-token', 'test-verify-token');
      const body = JSON.stringify(textMessage);

      const result = await noSecretAdapter.verifySignature(body, 'any-sig');

      expect(result).toBe(true);
    });
  });

  describe('receive', () => {
    it('handles GET verification challenge', async () => {
      const request = new Request(
        'http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge-123',
        { method: 'GET' },
      );

      const result = await adapter.receive(request);

      expect(result).toEqual({ _challenge: 'challenge-123' });
    });

    it('returns null for invalid GET verification', async () => {
      const request = new Request(
        'http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123',
        { method: 'GET' },
      );

      const result = await adapter.receive(request);

      expect(result).toBeNull();
    });

    it('returns null for invalid POST signature', async () => {
      const body = JSON.stringify(textMessage);
      const request = new Request('http://localhost/api/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid',
        },
        body,
      });

      const result = await adapter.receive(request);

      expect(result).toBeNull();
    });

    it('parses text message correctly', async () => {
      const request = createWhatsAppRequest(textMessage, 'app-secret');

      const result = await adapter.receive(request);

      expect(result).not.toBeNull();
      expect(result.threadId).toBe('1234567890');
      expect(result.text).toBe('Hello from WhatsApp');
      expect(result.metadata.messageId).toBe('wamid.123');
    });

    it('returns null for empty messages', async () => {
      const emptyPayload = {
        entry: [{
          changes: [{
            value: {
              messages: [],
            },
          }],
        }],
      };

      const request = createWhatsAppRequest(emptyPayload, 'app-secret');
      const result = await adapter.receive(request);

      expect(result).toBeNull();
    });

    it('returns null for unsupported message types', async () => {
      const unsupportedMessage = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '1234567890',
                id: 'wamid.456',
                type: 'contacts',
              }],
            },
          }],
        }],
      };

      const request = createWhatsAppRequest(unsupportedMessage, 'app-secret');
      const result = await adapter.receive(request);

      expect(result).toBeNull();
    });

    it('checks channel policies', async () => {
      const config = {
        policies: {
          dm: 'allowlist',
          allowFrom: ['9999999999'],
        },
      };
      const restrictedAdapter = new WhatsAppAdapter('phone-id', 'access-token', 'test-verify-token', 'app-secret', config);

      const request = createWhatsAppRequest(textMessage, 'app-secret');
      const result = await restrictedAdapter.receive(request);

      expect(result).toBeNull();
    });
  });

  describe('acknowledge', () => {
    it('calls markRead', async () => {
      const metadata = {
        phoneNumberId: 'phone-id',
        messageId: 'wamid.123',
      };

      await adapter.acknowledge(metadata);

      expect(whatsappTools.markRead).toHaveBeenCalledWith(
        'phone-id',
        'access-token',
        'wamid.123',
      );
    });
  });

  describe('sendResponse', () => {
    it('calls sendMessage with correct args', async () => {
      await adapter.sendResponse('1234567890', 'Hello back!');

      expect(whatsappTools.sendMessage).toHaveBeenCalledWith(
        'phone-id',
        'access-token',
        '1234567890',
        'Hello back!',
      );
    });
  });

  describe('supportsStreaming', () => {
    it('returns false', () => {
      expect(adapter.supportsStreaming).toBe(false);
    });
  });
});
