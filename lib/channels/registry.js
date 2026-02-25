import fs from "fs";
import { channelsFile } from "../paths.js";
class ChannelRegistry {
  _byId = /* @__PURE__ */ new Map();
  _byRoute = /* @__PURE__ */ new Map();
  /**
   * Register a channel adapter.
   */
  register(id, config, adapter) {
    this._byId.set(id, { config, adapter });
    if (config.webhook_path) {
      this._byRoute.set(config.webhook_path, id);
    }
  }
  /**
   * Get adapter by channel ID.
   */
  getById(id) {
    return this._byId.get(id);
  }
  /**
   * Get adapter by webhook route path.
   */
  getByRoute(routePath) {
    const id = this._byRoute.get(routePath);
    if (!id) return void 0;
    const entry = this._byId.get(id);
    if (!entry) return void 0;
    return { id, ...entry };
  }
  /**
   * Get all webhook paths (for PUBLIC_ROUTES).
   */
  getWebhookPaths() {
    return Array.from(this._byRoute.keys());
  }
  /**
   * Get all registered channels.
   */
  getAll() {
    return Array.from(this._byId.entries()).map(([id, entry]) => ({
      id,
      type: entry.config.type,
      enabled: entry.config.enabled,
      webhook_path: entry.config.webhook_path
    }));
  }
  /**
   * Number of registered channels.
   */
  get size() {
    return this._byId.size;
  }
}
function getChannelRegistry() {
  if (!globalThis.__mantisChannelRegistry) {
    globalThis.__mantisChannelRegistry = new ChannelRegistry();
  }
  return globalThis.__mantisChannelRegistry;
}
async function initChannelRegistry() {
  const registry = getChannelRegistry();
  let channels = [];
  try {
    if (fs.existsSync(channelsFile)) {
      channels = JSON.parse(fs.readFileSync(channelsFile, "utf8"));
    }
  } catch (err) {
    console.error("[channels] Failed to parse CHANNELS.json:", err.message);
  }
  if (channels.length === 0 && process.env.TELEGRAM_BOT_TOKEN) {
    channels = [
      {
        id: "telegram-default",
        type: "telegram",
        enabled: true,
        webhook_path: "/telegram/webhook",
        config: {
          bot_token_env: "TELEGRAM_BOT_TOKEN",
          webhook_secret_env: "TELEGRAM_WEBHOOK_SECRET",
          chat_id_env: "TELEGRAM_CHAT_ID"
        }
      }
    ];
  }
  for (const channel of channels) {
    if (!channel.enabled) continue;
    try {
      const adapter = await createAdapterForChannel(channel);
      if (adapter) {
        registry.register(channel.id, channel, adapter);
        console.log(`[channels] Registered ${channel.type} channel: ${channel.id}`);
      }
    } catch (err) {
      console.error(`[channels] Failed to initialize ${channel.id}:`, err.message);
    }
  }
  return registry;
}
async function createAdapterForChannel(channel) {
  switch (channel.type) {
    case "telegram": {
      const { TelegramAdapter } = await import("./telegram.js");
      const botToken = process.env[channel.config.bot_token_env];
      if (!botToken) {
        console.warn(`[channels] ${channel.id}: ${channel.config.bot_token_env} not set`);
        return null;
      }
      return new TelegramAdapter(botToken, channel);
    }
    case "slack": {
      const { SlackAdapter } = await import("./slack.js");
      const botToken = process.env[channel.config.bot_token_env];
      const signingSecret = process.env[channel.config.signing_secret_env];
      if (!botToken || !signingSecret) {
        console.warn(`[channels] ${channel.id}: Slack credentials not set`);
        return null;
      }
      return new SlackAdapter(botToken, signingSecret, channel);
    }
    case "discord": {
      const { DiscordAdapter } = await import("./discord.js");
      const botToken = process.env[channel.config.bot_token_env];
      const applicationId = process.env[channel.config.application_id_env];
      const publicKey = process.env[channel.config.public_key_env];
      if (!botToken || !publicKey) {
        console.warn(`[channels] ${channel.id}: Discord credentials not set`);
        return null;
      }
      return new DiscordAdapter(botToken, applicationId, publicKey, channel);
    }
    case "whatsapp": {
      const { WhatsAppAdapter } = await import("./whatsapp.js");
      const phoneNumberId = process.env[channel.config.phone_number_id_env];
      const accessToken = process.env[channel.config.access_token_env];
      const verifyToken = process.env[channel.config.verify_token_env];
      const appSecret = process.env[channel.config.app_secret_env];
      if (!phoneNumberId || !accessToken) {
        console.warn(`[channels] ${channel.id}: WhatsApp credentials not set`);
        return null;
      }
      return new WhatsAppAdapter(phoneNumberId, accessToken, verifyToken, appSecret, channel);
    }
    default:
      console.warn(`[channels] Unknown channel type: ${channel.type}`);
      return null;
  }
}
export {
  ChannelRegistry,
  getChannelRegistry,
  initChannelRegistry
};
