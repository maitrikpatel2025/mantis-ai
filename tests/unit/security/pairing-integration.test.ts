import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the pairing module to control verifyPairingCode behavior
vi.mock('../../../lib/security/pairing.js', () => ({
  verifyPairingCode: vi.fn().mockReturnValue(false),
}));

const { ChannelAdapter } = await import('../../../lib/channels/base.js');
const { verifyPairingCode } = await import('../../../lib/security/pairing.js');

const mockedVerify = verifyPairingCode as ReturnType<typeof vi.fn>;

describe('ChannelAdapter pairing integration', () => {
  beforeEach(() => {
    mockedVerify.mockReset();
    mockedVerify.mockReturnValue(false);
  });

  it('checkPolicy allows sender when pairing code is valid', () => {
    mockedVerify.mockReturnValue(true);

    const adapter = new ChannelAdapter({
      policies: { dm: 'allowlist', allowFrom: ['other-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'new-user',
      isGroup: false,
      text: 'AB12CD',
      channelId: 'telegram-1',
    });

    expect(result).toEqual({ allowed: true });
    expect(mockedVerify).toHaveBeenCalledWith('telegram-1', 'new-user', 'AB12CD');
  });

  it('checkPolicy denies sender when pairing code is invalid', () => {
    mockedVerify.mockReturnValue(false);

    const adapter = new ChannelAdapter({
      policies: { dm: 'allowlist', allowFrom: ['other-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'new-user',
      isGroup: false,
      text: 'WRONG1',
      channelId: 'telegram-1',
    });

    expect(result).toEqual({ allowed: false, reason: 'Sender not in DM allowlist' });
    expect(mockedVerify).toHaveBeenCalledWith('telegram-1', 'new-user', 'WRONG1');
  });

  it('checkPolicy denies sender when text is not a pairing code format', () => {
    const adapter = new ChannelAdapter({
      policies: { dm: 'allowlist', allowFrom: ['other-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'new-user',
      isGroup: false,
      text: 'Hello, I want to chat with you!',
      channelId: 'telegram-1',
    });

    expect(result).toEqual({ allowed: false, reason: 'Sender not in DM allowlist' });
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it('checkPolicy still allows senders in allowlist without pairing', () => {
    const adapter = new ChannelAdapter({
      policies: { dm: 'allowlist', allowFrom: ['trusted-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'trusted-user',
      isGroup: false,
      text: 'Just a regular message',
      channelId: 'telegram-1',
    });

    expect(result).toEqual({ allowed: true });
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it('checkPolicy handles verifyPairingCode throwing', () => {
    mockedVerify.mockImplementation(() => {
      throw new Error('Database not initialized');
    });

    const adapter = new ChannelAdapter({
      policies: { dm: 'allowlist', allowFrom: ['other-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'new-user',
      isGroup: false,
      text: 'XY34ZW',
      channelId: 'telegram-1',
    });

    expect(result).toEqual({ allowed: false, reason: 'Sender not in DM allowlist' });
    expect(mockedVerify).toHaveBeenCalledWith('telegram-1', 'new-user', 'XY34ZW');
  });

  it('checkPolicy does not attempt pairing when channelId is missing', () => {
    const adapter = new ChannelAdapter({
      policies: { dm: 'allowlist', allowFrom: ['other-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'new-user',
      isGroup: false,
      text: 'AB12CD',
      // no channelId provided
    });

    expect(result).toEqual({ allowed: false, reason: 'Sender not in DM allowlist' });
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it('checkPolicy does not attempt pairing when text is missing', () => {
    const adapter = new ChannelAdapter({
      policies: { dm: 'allowlist', allowFrom: ['other-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'new-user',
      isGroup: false,
      channelId: 'telegram-1',
      // no text provided
    });

    expect(result).toEqual({ allowed: false, reason: 'Sender not in DM allowlist' });
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it('checkPolicy trims whitespace from pairing code before verification', () => {
    mockedVerify.mockReturnValue(true);

    const adapter = new ChannelAdapter({
      policies: { dm: 'allowlist', allowFrom: ['other-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'new-user',
      isGroup: false,
      text: ' AB12CD ',
      channelId: 'telegram-1',
    });

    // The regex tests against text.trim(), and trim() is called before passing to verifyPairingCode
    expect(result).toEqual({ allowed: true });
    expect(mockedVerify).toHaveBeenCalledWith('telegram-1', 'new-user', 'AB12CD');
  });

  it('checkPolicy does not attempt pairing for group messages', () => {
    const adapter = new ChannelAdapter({
      policies: { group: 'allowlist', groupAllowFrom: ['other-user'] },
    });

    const result = adapter.checkPolicy({
      senderId: 'new-user',
      isGroup: true,
      text: 'AB12CD',
      channelId: 'telegram-1',
    });

    expect(result).toEqual({ allowed: false, reason: 'Sender not in group allowlist' });
    expect(mockedVerify).not.toHaveBeenCalled();
  });
});
