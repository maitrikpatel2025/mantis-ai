import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('../../../lib/tools/slack.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  downloadFile: vi.fn().mockResolvedValue(Buffer.from('test')),
  addReaction: vi.fn().mockResolvedValue(undefined),
  markdownToMrkdwn: vi.fn((text: string) => text),
}));

vi.mock('../../../lib/tools/openai.js', () => ({
  isWhisperEnabled: vi.fn().mockReturnValue(false),
  transcribeAudio: vi.fn().mockResolvedValue('transcribed text'),
}));

const SIGNING_SECRET = 'test-signing-secret';

function createSlackSignature(body: string, timestamp: string, secret: string): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', secret).update(sigBasestring).digest('hex');
  return `v0=${hmac}`;
}

function createSlackRequest(body: object, secret: string): Request {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createSlackSignature(rawBody, timestamp, secret);
  return new Request('http://localhost/api/slack/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': signature,
    },
    body: rawBody,
  });
}

const messageEvent = {
  type: 'event_callback',
  team_id: 'T123',
  event: {
    type: 'message',
    text: 'Hello from Slack',
    user: 'U123',
    channel: 'C123',
    ts: '1234567890.123456',
    channel_type: 'im',
  },
};

describe('SlackAdapter', () => {
  let SlackAdapter: any;
  let sendMessage: any;
  let addReaction: any;
  let markdownToMrkdwn: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const slackTools = await import('../../../lib/tools/slack.js');
    sendMessage = slackTools.sendMessage;
    addReaction = slackTools.addReaction;
    markdownToMrkdwn = slackTools.markdownToMrkdwn;

    // Re-set mock implementations after clearAllMocks
    vi.mocked(addReaction).mockResolvedValue(undefined);
    vi.mocked(sendMessage).mockResolvedValue(undefined);
    vi.mocked(markdownToMrkdwn).mockImplementation((text: string) => text);

    const mod = await import('../../../lib/channels/slack.js');
    SlackAdapter = mod.SlackAdapter;
  });

  describe('verifySignature', () => {
    it('returns true for valid signature', () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const body = '{"test":"data"}';
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createSlackSignature(body, timestamp, SIGNING_SECRET);

      expect(adapter.verifySignature(body, timestamp, signature)).toBe(true);
    });

    it('returns false for invalid signature', () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const body = '{"test":"data"}';
      const timestamp = String(Math.floor(Date.now() / 1000));

      expect(adapter.verifySignature(body, timestamp, 'v0=invalidsignature')).toBe(false);
    });

    it('returns false for old timestamp', () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const body = '{"test":"data"}';
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
      const signature = createSlackSignature(body, oldTimestamp, SIGNING_SECRET);

      expect(adapter.verifySignature(body, oldTimestamp, signature)).toBe(false);
    });
  });

  describe('receive', () => {
    it('returns null for invalid signature', async () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const request = new Request('http://localhost/api/slack/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
          'x-slack-signature': 'v0=invalidsignature',
        },
        body: JSON.stringify(messageEvent),
      });

      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });

    it('handles url_verification challenge', async () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const challenge = { type: 'url_verification', challenge: 'test-challenge-token' };
      const request = createSlackRequest(challenge, SIGNING_SECRET);

      const result = await adapter.receive(request);
      expect(result).toHaveProperty('_challenge', 'test-challenge-token');
    });

    it('parses message event correctly', async () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const request = createSlackRequest(messageEvent, SIGNING_SECRET);

      const result = await adapter.receive(request);
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty('_challenge');
      expect(result.threadId).toBeDefined();
      expect(result.text).toBe('Hello from Slack');
      expect(result.metadata).toBeDefined();
    });

    it('ignores bot messages', async () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const botEvent = {
        type: 'event_callback',
        team_id: 'T123',
        event: {
          type: 'message',
          text: 'I am a bot',
          bot_id: 'B123',
          channel: 'C123',
          ts: '1234567890.123456',
          channel_type: 'im',
        },
      };
      const request = createSlackRequest(botEvent, SIGNING_SECRET);

      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });

    it('ignores non-message events', async () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const nonMessageEvent = {
        type: 'event_callback',
        team_id: 'T123',
        event: {
          type: 'reaction_added',
          user: 'U123',
          reaction: 'thumbsup',
          item: { type: 'message', channel: 'C123', ts: '1234567890.123456' },
        },
      };
      const request = createSlackRequest(nonMessageEvent, SIGNING_SECRET);

      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });

    it('checks channel policies', async () => {
      const channelConfig = {
        policies: {
          dm: 'allowlist',
          allowFrom: ['other-user'],
        },
      };
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET, channelConfig);
      const request = createSlackRequest(messageEvent, SIGNING_SECRET);

      const result = await adapter.receive(request);
      expect(result).toBeNull();
    });
  });

  describe('sendResponse', () => {
    it('calls sendMessage with mrkdwn conversion', async () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const metadata = { channel: 'C123', ts: '1234567890.123456' };
      await adapter.sendResponse('C123', 'Hello user', metadata);

      expect(markdownToMrkdwn).toHaveBeenCalledWith('Hello user');
      expect(sendMessage).toHaveBeenCalled();
    });
  });

  describe('acknowledge', () => {
    it('calls addReaction', async () => {
      const adapter = new SlackAdapter('xoxb-bot-token', SIGNING_SECRET);
      const metadata = { channel: 'C123', ts: '1234567890.123456' };
      await adapter.acknowledge(metadata);

      expect(addReaction).toHaveBeenCalled();
    });
  });
});
