import { beforeEach, vi } from 'vitest';

// Set required env defaults for tests
process.env.AUTH_SECRET = 'test-auth-secret-for-vitest';
process.env.DATABASE_PATH = ':memory:';
process.env.APP_URL = 'http://localhost:3000';
process.env.GH_TOKEN = 'test-gh-token';
process.env.GH_OWNER = 'test-owner';
process.env.GH_REPO = 'test-repo';

// Reset all mocks between tests
beforeEach(() => {
  vi.restoreAllMocks();
});
