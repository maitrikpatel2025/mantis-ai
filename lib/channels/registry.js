import fs from 'fs';
import { channelsFile } from '../paths.js';

/**
 * ChannelRegistry — register/lookup channel adapters by route or ID.
 * Initialized from CHANNELS.json at server startup.
 */
class ChannelRegistry {
  constructor() {
    /** @type {Map<string, { config: object, adapter: import('./base.js').ChannelAdapter }>} */
    this._byId = new Map();
    /** @type {Map<string, string>} route path -> channel id */
    this._byRoute = new Map();
  }

  /**
   * Register a channel adapter.
   * @param {string} id - Unique channel ID
   * @param {object} config - Channel config from CHANNELS.json
   * @param {import('./base.js').ChannelAdapter} adapter - Adapter instance
   */
  register(id, config, adapter) {
    this._byId.set(id, { config, adapter });
    if (config.webhook_path) {
      this._byRoute.set(config.webhook_path, id);
    }
  }

  /**
   * Get adapter by channel ID.
   * @param {string} id
   * @returns {{ config: object, adapter: import('./base.js').ChannelAdapter } | undefined}
   */
  getById(id) {
    return this._byId.get(id);
  }

  /**
   * Get adapter by webhook route path.
   * @param {string} routePath - e.g., '/telegram/webhook'
   * @returns {{ id: string, config: object, adapter: import('./base.js').ChannelAdapter } | undefined}
   */
  getByRoute(routePath) {
    const id = this._byRoute.get(routePath);
    if (!id) return undefined;
    const entry = this._byId.get(id);
    if (!entry) return undefined;
    return { id, ...entry };
  }

  /**
   * Get all webhook paths (for PUBLIC_ROUTES).
   * @returns {string[]}
   */
  getWebhookPaths() {
    return Array.from(this._byRoute.keys());
  }

  /**
   * Get all registered channels.
   * @returns {Array<{ id: string, config: object, adapter: object }>}
   */
  getAll() {
    return Array.from(this._byId.entries()).map(([id, entry]) => ({
      id,
      type: entry.config.type,
      enabled: entry.config.enabled,
      webhook_path: entry.config.webhook_path,
    }));
  }

  /**
   * Number of registered channels.
   */
  get size() {
    return this._byId.size;
  }
}

/** @type {ChannelRegistry | null} */
let _registry = null;

/**
 * Get the global channel registry singleton.
 * @returns {ChannelRegistry}
 */
export function getChannelRegistry() {
  if (!_registry) {
    _registry = new ChannelRegistry();
  }
  return _registry;
}

/**
 * Initialize the channel registry from CHANNELS.json.
 * Creates adapters for each enabled channel.
 * Falls back to env-var Telegram if no CHANNELS.json.
 */
export async function initChannelRegistry() {
  const registry = getChannelRegistry();

  let channels = [];

  // Try loading CHANNELS.json
  try {
    if (fs.existsSync(channelsFile)) {
      channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
    }
  } catch (err) {
    console.error('[channels] Failed to parse CHANNELS.json:', err.message);
  }

  // Backward compat: if no CHANNELS.json, create default Telegram entry from env
  if (channels.length === 0 && process.env.TELEGRAM_BOT_TOKEN) {
    channels = [
      {
        id: 'telegram-default',
        type: 'telegram',
        enabled: true,
        webhook_path: '/telegram/webhook',
        config: {
          bot_token_env: 'TELEGRAM_BOT_TOKEN',
          webhook_secret_env: 'TELEGRAM_WEBHOOK_SECRET',
          chat_id_env: 'TELEGRAM_CHAT_ID',
        },
      },
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

/**
 * Create an adapter instance for a channel config.
 * @param {object} channel - Channel config from CHANNELS.json
 * @returns {Promise<import('./base.js').ChannelAdapter | null>}
 */
async function createAdapterForChannel(channel) {
  switch (channel.type) {
    case 'telegram': {
      const { TelegramAdapter } = await import('./telegram.js');
      const botToken = process.env[channel.config.bot_token_env];
      if (!botToken) {
        console.warn(`[channels] ${channel.id}: ${channel.config.bot_token_env} not set`);
        return null;
      }
      return new TelegramAdapter(botToken);
    }

    case 'slack': {
      const { SlackAdapter } = await import('./slack.js');
      const botToken = process.env[channel.config.bot_token_env];
      const signingSecret = process.env[channel.config.signing_secret_env];
      if (!botToken || !signingSecret) {
        console.warn(`[channels] ${channel.id}: Slack credentials not set`);
        return null;
      }
      return new SlackAdapter(botToken, signingSecret);
    }

    case 'discord': {
      const { DiscordAdapter } = await import('./discord.js');
      const botToken = process.env[channel.config.bot_token_env];
      const applicationId = process.env[channel.config.application_id_env];
      const publicKey = process.env[channel.config.public_key_env];
      if (!botToken || !publicKey) {
        console.warn(`[channels] ${channel.id}: Discord credentials not set`);
        return null;
      }
      return new DiscordAdapter(botToken, applicationId, publicKey);
    }

    case 'whatsapp': {
      const { WhatsAppAdapter } = await import('./whatsapp.js');
      const phoneNumberId = process.env[channel.config.phone_number_id_env];
      const accessToken = process.env[channel.config.access_token_env];
      const verifyToken = process.env[channel.config.verify_token_env];
      const appSecret = process.env[channel.config.app_secret_env];
      if (!phoneNumberId || !accessToken) {
        console.warn(`[channels] ${channel.id}: WhatsApp credentials not set`);
        return null;
      }
      return new WhatsAppAdapter(phoneNumberId, accessToken, verifyToken, appSecret);
    }

    default:
      console.warn(`[channels] Unknown channel type: ${channel.type}`);
      return null;
  }
}

export { ChannelRegistry };
