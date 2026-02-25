import { vi } from 'vitest';

/**
 * Create a mock LLM model that returns a fixed response.
 */
export function createMockModel(response: string = 'Test response') {
  return {
    invoke: vi.fn().mockResolvedValue({
      content: response,
    }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { content: response };
    }),
    withFallbacks: vi.fn().mockReturnThis(),
  };
}

/**
 * Create a mock fetch function.
 */
export function createMockFetch(response: unknown = {}, status: number = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(response),
    text: vi.fn().mockResolvedValue(JSON.stringify(response)),
    headers: new Headers(),
  });
}

/**
 * Mock the getDb function to use a test database.
 */
export function mockGetDb(testDb: unknown) {
  vi.mock('../../lib/db/index.js', () => ({
    getDb: () => testDb,
    initDatabase: vi.fn(),
  }));
}
