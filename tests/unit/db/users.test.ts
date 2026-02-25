import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/db.js';
import { TEST_USER } from '../../helpers/fixtures.js';

// Mock getDb to use our test database
let testDb: ReturnType<typeof createTestDb>;

vi.mock('../../../lib/db/index.js', () => ({
  getDb: () => testDb.db,
}));

// Import after mocking
const { getUserCount, getUserByEmail, createUser, createFirstUser, verifyPassword } = await import('../../../lib/db/users.js');

describe('DB: Users', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it('getUserCount returns 0 when no users', () => {
    expect(getUserCount()).toBe(0);
  });

  it('createUser creates a user and returns safe data', async () => {
    const result = await createUser(TEST_USER.email, TEST_USER.password);
    expect(result.email).toBe(TEST_USER.email);
    expect(result.role).toBe('admin');
    expect(result.id).toBeDefined();
    // Should not return passwordHash
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('getUserCount returns 1 after creating a user', async () => {
    await createUser(TEST_USER.email, TEST_USER.password);
    expect(getUserCount()).toBe(1);
  });

  it('getUserByEmail finds created user', async () => {
    await createUser(TEST_USER.email, TEST_USER.password);
    const user = getUserByEmail(TEST_USER.email);
    expect(user).toBeDefined();
    expect(user!.email).toBe(TEST_USER.email);
  });

  it('getUserByEmail returns undefined for non-existent user', () => {
    const user = getUserByEmail('nobody@test.com');
    expect(user).toBeUndefined();
  });

  it('verifyPassword validates correct password', async () => {
    await createUser(TEST_USER.email, TEST_USER.password);
    const user = getUserByEmail(TEST_USER.email);
    const valid = await verifyPassword(user!, TEST_USER.password);
    expect(valid).toBe(true);
  });

  it('verifyPassword rejects wrong password', async () => {
    await createUser(TEST_USER.email, TEST_USER.password);
    const user = getUserByEmail(TEST_USER.email);
    const valid = await verifyPassword(user!, 'wrong-password');
    expect(valid).toBe(false);
  });

  it('createFirstUser creates user only if no users exist', async () => {
    const first = createFirstUser(TEST_USER.email, TEST_USER.password);
    expect(first).not.toBeNull();
    expect(first!.email).toBe(TEST_USER.email);

    // Second call should return null
    const second = createFirstUser('other@test.com', 'password2');
    expect(second).toBeNull();
  });

  it('email is case-insensitive', async () => {
    await createUser('Admin@Test.COM', TEST_USER.password);
    const user = getUserByEmail('admin@test.com');
    expect(user).toBeDefined();
    expect(user!.email).toBe('admin@test.com');
  });
});
