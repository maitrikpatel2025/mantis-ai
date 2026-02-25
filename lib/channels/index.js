import { TelegramAdapter } from "./telegram.js";
import { TelegramAdapter as TelegramAdapter2 } from "./telegram.js";
import { SlackAdapter } from "./slack.js";
import { DiscordAdapter } from "./discord.js";
import { WhatsAppAdapter } from "./whatsapp.js";
import { ChannelRegistry, getChannelRegistry, initChannelRegistry } from "./registry.js";
let _telegramAdapter = null;
function getTelegramAdapter(botToken) {
  if (!_telegramAdapter || _telegramAdapter.botToken !== botToken) {
    _telegramAdapter = new TelegramAdapter(botToken, {});
  }
  return _telegramAdapter;
}
export {
  ChannelRegistry,
  DiscordAdapter,
  SlackAdapter,
  TelegramAdapter2 as TelegramAdapter,
  WhatsAppAdapter,
  getChannelRegistry,
  getTelegramAdapter,
  initChannelRegistry
};
