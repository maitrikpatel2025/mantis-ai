/**
 * Shared test fixtures.
 */

export const TEST_USER = {
  email: 'admin@test.com',
  password: 'test-password-123',
};

export const TEST_CHAT = {
  title: 'Test Chat',
};

export const TEST_JOB = {
  prompt: 'Fix the bug in the login page',
  source: 'chat' as const,
};

export const TEST_MEMORY = {
  content: 'The project uses React with TypeScript and Tailwind CSS',
  category: 'project' as const,
  relevance: 7,
};

export const TEST_CRON_RUN = {
  cronName: 'daily-backup',
  status: 'success',
  startedAt: Date.now(),
  completedAt: Date.now() + 1000,
  durationMs: 1000,
};
