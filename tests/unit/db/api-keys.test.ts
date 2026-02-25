import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/db.js';

let testDb: ReturnType<typeof createTestDb>;

vi.mock('../../../lib/db/index.js', () => ({
  getDb: () => testDb.db,
}));

const { generateApiKey, hashApiKey, createApiKeyRecord, getApiKey, deleteApiKey, verifyApiKey, invalidateApiKeyCache } = await import('../../../lib/db/api-keys.js');

describe('DB: API Keys', () => {
  beforeEach(() => {
    testDb = createTestDb();
    invalidateApiKeyCache();
  });

  it('generateApiKey creates a tpb_ prefixed key', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^tpb_[0-9a-f]{64}$/);
  });

  it('hashApiKey produces consistent SHA-256 hash', () => {
    const key = 'tpb_test123';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it('createApiKeyRecord creates and returns key', () => {
    const { key, record } = createApiKeyRecord('user-1');
    expect(key).toMatch(/^tpb_/);
    expect(record.id).toBeDefined();
    expect(record.keyPrefix).toBe(key.slice(0, 8));
    expect(record.lastUsedAt).toBeNull();
  });

  it('getApiKey returns metadata', () => {
    createApiKeyRecord('user-1');
    const apiKey = getApiKey();
    expect(apiKey).not.toBeNull();
    expect(apiKey!.keyPrefix).toMatch(/^tpb_/);
  });

  it('getApiKey returns null when no key exists', () => {
    expect(getApiKey()).toBeNull();
  });

  it('verifyApiKey accepts valid key', () => {
    const { key } = createApiKeyRecord('user-1');
    invalidateApiKeyCache(); // Force cache reload
    const result = verifyApiKey(key);
    expect(result).not.toBeNull();
  });

  it('verifyApiKey rejects invalid key', () => {
    createApiKeyRecord('user-1');
    invalidateApiKeyCache();
    const result = verifyApiKey('tpb_invalid');
    expect(result).toBeNull();
  });

  it('verifyApiKey rejects non-prefixed key', () => {
    const result = verifyApiKey('not-a-valid-key');
    expect(result).toBeNull();
  });

  it('deleteApiKey removes the key', () => {
    createApiKeyRecord('user-1');
    deleteApiKey();
    expect(getApiKey()).toBeNull();
  });

  it('createApiKeyRecord replaces existing key', () => {
    const { key: key1 } = createApiKeyRecord('user-1');
    const { key: key2 } = createApiKeyRecord('user-1');
    expect(key1).not.toBe(key2);
    invalidateApiKeyCache();
    expect(verifyApiKey(key1)).toBeNull();
    expect(verifyApiKey(key2)).not.toBeNull();
  });
});
