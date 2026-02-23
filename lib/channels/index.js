import { TelegramAdapter } from './telegram.js';
export { TelegramAdapter } from './telegram.js';
export { SlackAdapter } from './slack.js';
export { DiscordAdapter } from './discord.js';
export { WhatsAppAdapter } from './whatsapp.js';
export { ChannelRegistry, getChannelRegistry, initChannelRegistry } from './registry.js';

let _telegramAdapter = null;

/**
 * Get the Telegram channel adapter (lazy singleton).
 * Kept for backward compatibility.
 * @param {string} botToken - Telegram bot token
 * @returns {TelegramAdapter}
 */
export function getTelegramAdapter(botToken) {
  if (!_telegramAdapter || _telegramAdapter.botToken !== botToken) {
    _telegramAdapter = new TelegramAdapter(botToken, {});
  }
  return _telegramAdapter;
}
