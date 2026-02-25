import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/db.js';

let testDb: ReturnType<typeof createTestDb>;

vi.mock('../../../lib/db/index.js', () => ({
  getDb: () => testDb.db,
}));

const { generatePairingCode, verifyPairingCode, getAllowlist } = await import('../../../lib/security/pairing.js');

describe('Security: DM Pairing', () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it('generatePairingCode returns a 6-char code', () => {
    const result = generatePairingCode('telegram-1');
    expect(result.code).toHaveLength(6);
    expect(result.channelId).toBe('telegram-1');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('verifyPairingCode succeeds with correct code', () => {
    const { code } = generatePairingCode('telegram-1');
    const valid = verifyPairingCode('telegram-1', 'sender-123', code);
    expect(valid).toBe(true);
  });

  it('verifyPairingCode is case-insensitive', () => {
    const { code } = generatePairingCode('telegram-1');
    const valid = verifyPairingCode('telegram-1', 'sender-123', code.toLowerCase());
    expect(valid).toBe(true);
  });

  it('verifyPairingCode rejects wrong code', () => {
    generatePairingCode('telegram-1');
    const valid = verifyPairingCode('telegram-1', 'sender-123', 'WRONG1');
    expect(valid).toBe(false);
  });

  it('verifyPairingCode rejects wrong channel', () => {
    const { code } = generatePairingCode('telegram-1');
    const valid = verifyPairingCode('telegram-2', 'sender-123', code);
    expect(valid).toBe(false);
  });

  it('successful pairing adds sender to allowlist', () => {
    const { code } = generatePairingCode('telegram-1');
    verifyPairingCode('telegram-1', 'sender-123', code);
    const allowlist = getAllowlist('telegram-1');
    expect(allowlist).toContain('sender-123');
  });

  it('pairing code is consumed after use', () => {
    const { code } = generatePairingCode('telegram-1');
    verifyPairingCode('telegram-1', 'sender-123', code);
    // Second use should fail
    const valid = verifyPairingCode('telegram-1', 'sender-456', code);
    expect(valid).toBe(false);
  });

  it('new pairing code replaces old one', () => {
    const { code: code1 } = generatePairingCode('telegram-1');
    const { code: code2 } = generatePairingCode('telegram-1');
    // Old code should be invalid
    const valid1 = verifyPairingCode('telegram-1', 'sender-1', code1);
    expect(valid1).toBe(false);
    // New code should work
    const valid2 = verifyPairingCode('telegram-1', 'sender-2', code2);
    expect(valid2).toBe(true);
  });
});
