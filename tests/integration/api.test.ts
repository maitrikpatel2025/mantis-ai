import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock values — available inside vi.mock() factories
// ---------------------------------------------------------------------------

const { mockCreateJob, mockGetJobStatus, mockVerifyApiKey, mockGetTelegramAdapter,
        mockGetChannelRegistry, mockSummarizeJob, mockCreateNotification,
        mockLoadTriggers, mockChat, mockChatWithAgent } = vi.hoisted(() => {
  const mockCreateJob = vi.fn().mockResolvedValue({ job_id: 'test-123', branch: 'job/test-123' });
  const mockGetJobStatus = vi.fn().mockResolvedValue({ status: 'running' });
  const mockVerifyApiKey = vi.fn().mockReturnValue(null);
  const mockGetTelegramAdapter = vi.fn().mockReturnValue({
    receive: vi.fn().mockResolvedValue(null),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    startProcessingIndicator: vi.fn().mockReturnValue(() => {}),
    sendResponse: vi.fn().mockResolvedValue(undefined),
  });
  const mockGetChannelRegistry = vi.fn().mockReturnValue({
    getWebhookPaths: vi.fn().mockReturnValue([]),
    getByRoute: vi.fn().mockReturnValue(undefined),
  });
  const mockSummarizeJob = vi.fn().mockResolvedValue('Job summary');
  const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
  const mockLoadTriggers = vi.fn().mockReturnValue({
    triggerMap: new Map(),
    fireTriggers: vi.fn(),
  });
  const mockChat = vi.fn().mockResolvedValue('AI response');
  const mockChatWithAgent = vi.fn().mockResolvedValue('Agent response');

  return {
    mockCreateJob,
    mockGetJobStatus,
    mockVerifyApiKey,
    mockGetTelegramAdapter,
    mockGetChannelRegistry,
    mockSummarizeJob,
    mockCreateNotification,
    mockLoadTriggers,
    mockChat,
    mockChatWithAgent,
  };
});

// ---------------------------------------------------------------------------
// Mock all dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../lib/tools/create-job.js', () => ({
  createJob: mockCreateJob,
}));

vi.mock('../../lib/tools/telegram.js', () => ({
  setWebhook: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../../lib/tools/github.js', () => ({
  getJobStatus: mockGetJobStatus,
}));

vi.mock('../../lib/channels/index.js', () => ({
  getTelegramAdapter: mockGetTelegramAdapter,
}));

vi.mock('../../lib/channels/registry.js', () => ({
  getChannelRegistry: mockGetChannelRegistry,
}));

vi.mock('../../lib/ai/index.js', () => ({
  chat: mockChat,
  chatWithAgent: mockChatWithAgent,
  summarizeJob: mockSummarizeJob,
}));

vi.mock('../../lib/db/notifications.js', () => ({
  createNotification: mockCreateNotification,
}));

vi.mock('../../lib/triggers.js', () => ({
  loadTriggers: mockLoadTriggers,
}));

vi.mock('../../lib/db/api-keys.js', () => ({
  verifyApiKey: mockVerifyApiKey,
}));

// ---------------------------------------------------------------------------
// Helper to build Request objects for the API handlers
// ---------------------------------------------------------------------------

function createRequest(
  method: string,
  path: string,
  body?: object,
  headers?: Record<string, string>
): Request {
  const url = `http://localhost:3000/api${path}`;
  const init: RequestInit = { method, headers: { ...headers } };
  if (body) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Restore default mock implementations after clearAllMocks
    mockVerifyApiKey.mockReturnValue(null);
    mockGetChannelRegistry.mockReturnValue({
      getWebhookPaths: vi.fn().mockReturnValue([]),
      getByRoute: vi.fn().mockReturnValue(undefined),
    });
    mockLoadTriggers.mockReturnValue({
      triggerMap: new Map(),
      fireTriggers: vi.fn(),
    });
    mockCreateJob.mockResolvedValue({ job_id: 'test-123', branch: 'job/test-123' });
    mockGetJobStatus.mockResolvedValue({ status: 'running' });
    mockSummarizeJob.mockResolvedValue('Job summary');
    mockCreateNotification.mockResolvedValue(undefined);
    mockGetTelegramAdapter.mockReturnValue({
      receive: vi.fn().mockResolvedValue(null),
      acknowledge: vi.fn().mockResolvedValue(undefined),
      startProcessingIndicator: vi.fn().mockReturnValue(() => {}),
      sendResponse: vi.fn().mockResolvedValue(undefined),
    });

    process.env.GH_WEBHOOK_SECRET = 'test-gh-secret';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  });

  // -------------------------------------------------------------------------
  // GET handler
  // -------------------------------------------------------------------------

  describe('GET', () => {
    it('GET /ping returns Pong', async () => {
      const { GET } = await import('../../api/index.js');

      const req = createRequest('GET', '/ping');
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ message: 'Pong!' });
    });

    it('GET /jobs/status returns 401 without API key', async () => {
      const { GET } = await import('../../api/index.js');

      const req = createRequest('GET', '/jobs/status');
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('GET /jobs/status returns data with valid API key', async () => {
      mockVerifyApiKey.mockReturnValue({ id: 'key-1', name: 'Test Key' });

      const { GET } = await import('../../api/index.js');

      const req = createRequest('GET', '/jobs/status', undefined, {
        'x-api-key': 'valid-key',
      });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ status: 'running' });
    });

    it('GET unknown route returns 401 without API key', async () => {
      const { GET } = await import('../../api/index.js');

      const req = createRequest('GET', '/nonexistent');
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('GET unknown route returns 404 with valid API key', async () => {
      mockVerifyApiKey.mockReturnValue({ id: 'key-1', name: 'Test Key' });

      const { GET } = await import('../../api/index.js');

      const req = createRequest('GET', '/nonexistent', undefined, {
        'x-api-key': 'valid-key',
      });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data).toEqual({ error: 'Not found' });
    });
  });

  // -------------------------------------------------------------------------
  // POST handler
  // -------------------------------------------------------------------------

  describe('POST', () => {
    it('POST /create-job returns 401 without API key', async () => {
      const { POST } = await import('../../api/index.js');

      const req = createRequest('POST', '/create-job', { job: 'do something' });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('POST /create-job creates job with valid API key', async () => {
      mockVerifyApiKey.mockReturnValue({ id: 'key-1', name: 'Test Key' });

      const { POST } = await import('../../api/index.js');

      const req = createRequest(
        'POST',
        '/create-job',
        { job: 'write a haiku' },
        { 'x-api-key': 'valid-key' }
      );
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ job_id: 'test-123', branch: 'job/test-123' });
    });

    it('POST /create-job returns 400 when job field is missing', async () => {
      mockVerifyApiKey.mockReturnValue({ id: 'key-1', name: 'Test Key' });

      const { POST } = await import('../../api/index.js');

      const req = createRequest(
        'POST',
        '/create-job',
        { notJob: 'oops' },
        { 'x-api-key': 'valid-key' }
      );
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data).toEqual({ error: 'Missing job field' });
    });

    it('POST /telegram/webhook returns ok (public route)', async () => {
      const { POST } = await import('../../api/index.js');

      const req = createRequest('POST', '/telegram/webhook', { message: { text: 'hi' } });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ ok: true });
    });

    it('POST /github/webhook returns 401 without secret', async () => {
      const { POST } = await import('../../api/index.js');

      const req = createRequest('POST', '/github/webhook', {
        job_id: 'abc',
        branch: 'job/abc',
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('POST /github/webhook processes payload with valid secret', async () => {
      const { POST } = await import('../../api/index.js');

      const req = createRequest(
        'POST',
        '/github/webhook',
        {
          job_id: 'abc-123',
          branch: 'job/abc-123',
          job: 'test task',
          status: 'success',
        },
        { 'x-github-webhook-secret-token': 'test-gh-secret' }
      );
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ ok: true, notified: true });
    });

    it('POST unknown route returns 404', async () => {
      mockVerifyApiKey.mockReturnValue({ id: 'key-1', name: 'Test Key' });

      const { POST } = await import('../../api/index.js');

      const req = createRequest(
        'POST',
        '/nonexistent',
        { data: 'test' },
        { 'x-api-key': 'valid-key' }
      );
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data).toEqual({ error: 'Not found' });
    });
  });
});
