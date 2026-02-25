import { TelegramAdapter } from './telegram.js';
export { TelegramAdapter } from './telegram.js';
export { SlackAdapter } from './slack.js';
export { DiscordAdapter } from './discord.js';
export { WhatsAppAdapter } from './whatsapp.js';
export { ChannelRegistry, getChannelRegistry, initChannelRegistry } from './registry.js';

let _telegramAdapter: TelegramAdapter | null = null;

/**
 * Get the Telegram channel adapter (lazy singleton).
 * Kept for backward compatibility.
 */
export function getTelegramAdapter(botToken: string): TelegramAdapter {
  if (!_telegramAdapter || _telegramAdapter.botToken !== botToken) {
    _telegramAdapter = new TelegramAdapter(botToken, {});
  }
  return _telegramAdapter;
}
