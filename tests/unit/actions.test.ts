import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', async () => {
  const actual = await vi.importActual('util');
  return {
    ...(actual as object),
    promisify: () => vi.fn().mockResolvedValue({ stdout: 'command output', stderr: '' }),
  };
});

vi.mock('../../lib/tools/create-job.js', () => ({
  createJob: vi.fn().mockResolvedValue({ job_id: 'test-job-123' }),
}));

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
});
vi.stubGlobal('fetch', mockFetch);

describe('actions - executeAction', () => {
  let executeAction: Function;
  let createJob: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
    });

    // Re-set createJob mock after clearAllMocks
    const createJobMod = await import('../../lib/tools/create-job.js');
    createJob = createJobMod.createJob as ReturnType<typeof vi.fn>;
    createJob.mockResolvedValue({ job_id: 'test-job-123' });

    // Need to reset modules to get a fresh execAsync with working mock
    vi.resetModules();
    const mod = await import('../../lib/actions.js');
    executeAction = mod.executeAction;

    // Re-import createJob after resetModules
    const freshCreateJobMod = await import('../../lib/tools/create-job.js');
    createJob = freshCreateJobMod.createJob as ReturnType<typeof vi.fn>;
    createJob.mockResolvedValue({ job_id: 'test-job-123' });
  });

  describe('agent type (default)', () => {
    it('calls createJob with the job prompt', async () => {
      await executeAction({ type: 'agent', job: 'do something important' });

      expect(createJob).toHaveBeenCalledWith(
        'do something important',
        expect.objectContaining({ source: expect.any(String) }),
      );
    });

    it('returns a job ID string', async () => {
      const result = await executeAction({ type: 'agent', job: 'test task' });

      expect(result).toContain('test-job-123');
    });

    it('defaults to agent type when type is not specified', async () => {
      await executeAction({ job: 'implicit agent task' });

      expect(createJob).toHaveBeenCalledWith(
        'implicit agent task',
        expect.objectContaining({ source: expect.any(String) }),
      );
    });

    it('passes source from opts', async () => {
      await executeAction({ type: 'agent', job: 'sourced task' }, { source: 'cron' });

      expect(createJob).toHaveBeenCalledWith(
        'sourced task',
        expect.objectContaining({ source: 'cron' }),
      );
    });
  });

  describe('command type', () => {
    it('executes the command', async () => {
      const result = await executeAction({ type: 'command', command: 'echo hello' });

      expect(result).toBe('command output');
    });

    it('returns trimmed stdout', async () => {
      const result = await executeAction({ type: 'command', command: 'ls -la' });

      expect(typeof result).toBe('string');
      expect(result).toBe('command output');
    });
  });

  describe('webhook type', () => {
    it('sends POST request with vars in body', async () => {
      await executeAction({
        type: 'webhook',
        url: 'https://example.com/hook',
        method: 'POST',
        vars: { key: 'value' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"key":"value"'),
        }),
      );
    });

    it('sends GET request without body', async () => {
      await executeAction({
        type: 'webhook',
        url: 'https://example.com/status',
        method: 'GET',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/status',
        expect.objectContaining({ method: 'GET' }),
      );

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.body).toBeUndefined();
    });

    it('returns status string with method, url, and status code', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: vi.fn(),
        text: vi.fn(),
      });

      const result = await executeAction({
        type: 'webhook',
        url: 'https://example.com/api',
        method: 'POST',
      });

      expect(result).toContain('POST');
      expect(result).toContain('https://example.com/api');
      expect(result).toContain('201');
    });

    it('merges opts.data into the POST body', async () => {
      await executeAction(
        {
          type: 'webhook',
          url: 'https://example.com/hook',
          vars: { extra: 'info' },
        },
        { data: { incoming: 'payload' } },
      );

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.extra).toBe('info');
      expect(body.data).toEqual({ incoming: 'payload' });
    });

    it('defaults method to POST', async () => {
      await executeAction({
        type: 'webhook',
        url: 'https://example.com/hook',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('includes custom headers', async () => {
      await executeAction({
        type: 'webhook',
        url: 'https://example.com/hook',
        headers: { Authorization: 'Bearer token123' },
      });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token123',
        }),
      );
    });
  });
});
