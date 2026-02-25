import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/db.js';

let testDb: ReturnType<typeof createTestDb>;

vi.mock('../../../lib/db/index.js', () => ({
  getDb: () => testDb.db,
}));

vi.mock('../../../lib/events/bus.js', () => ({
  emitEvent: vi.fn(),
}));

const { insertJob, getJobById, updateJob, completeJob, failJob, getRecentJobs, getActiveJobs, getJobCounts } = await import('../../../lib/db/jobs.js');

describe('DB: Jobs', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it('insertJob creates a job', () => {
    const job = insertJob({ id: 'job-1', prompt: 'Fix the bug' });
    expect(job.id).toBe('job-1');
    expect(job.status).toBe('created');
    expect(job.source).toBe('chat');
  });

  it('getJobById retrieves a job', () => {
    insertJob({ id: 'job-1', prompt: 'Fix the bug' });
    const job = getJobById('job-1');
    expect(job).toBeDefined();
    expect(job!.prompt).toBe('Fix the bug');
  });

  it('updateJob changes fields', () => {
    insertJob({ id: 'job-1', prompt: 'Fix the bug' });
    updateJob('job-1', { status: 'queued', branch: 'job/abc' });
    const job = getJobById('job-1');
    expect(job!.status).toBe('queued');
    expect(job!.branch).toBe('job/abc');
  });

  it('completeJob marks a job as completed', () => {
    insertJob({ id: 'job-1', prompt: 'Fix the bug' });
    completeJob('job-1', { summary: 'Fixed it', prUrl: 'https://github.com/pr/1' });
    const job = getJobById('job-1');
    expect(job!.status).toBe('completed');
    expect(job!.summary).toBe('Fixed it');
    expect(job!.completedAt).toBeDefined();
  });

  it('failJob marks a job as failed', () => {
    insertJob({ id: 'job-1', prompt: 'Fix the bug' });
    failJob('job-1', 'Docker build failed');
    const job = getJobById('job-1');
    expect(job!.status).toBe('failed');
    expect(job!.error).toBe('Docker build failed');
  });

  it('getRecentJobs returns jobs sorted by created date', () => {
    insertJob({ id: 'job-1', prompt: 'Job 1' });
    insertJob({ id: 'job-2', prompt: 'Job 2' });
    const jobs = getRecentJobs();
    expect(jobs).toHaveLength(2);
  });

  it('getRecentJobs filters by status', () => {
    insertJob({ id: 'job-1', prompt: 'Job 1' });
    insertJob({ id: 'job-2', prompt: 'Job 2' });
    completeJob('job-1', {});
    const completed = getRecentJobs({ status: 'completed' });
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe('job-1');
  });

  it('getActiveJobs returns created/queued jobs', () => {
    insertJob({ id: 'job-1', prompt: 'Job 1' });
    insertJob({ id: 'job-2', prompt: 'Job 2' });
    completeJob('job-1', {});
    const active = getActiveJobs();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('job-2');
  });

  it('getJobCounts returns status breakdown', () => {
    insertJob({ id: 'job-1', prompt: 'Job 1' });
    insertJob({ id: 'job-2', prompt: 'Job 2' });
    completeJob('job-1', {});
    failJob('job-2', 'Error');
    const counts = getJobCounts();
    expect(counts.completed).toBe(1);
    expect(counts.failed).toBe(1);
  });
});
