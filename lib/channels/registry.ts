import fs from 'fs';
import { channelsFile } from '../paths.js';
import { ChannelAdapter } from './base.js';
import type { ChannelConfig, ChannelRegistryEntry } from '../types.js';

declare global {
  // eslint-disable-next-line no-var
  var __mantisChannelRegistry: ChannelRegistry | undefined;
}

/**
 * ChannelRegistry — register/lookup channel adapters by route or ID.
 * Initialized from CHANNELS.json at server startup.
 */
class ChannelRegistry {
  private _byId: Map<string, ChannelRegistryEntry> = new Map();
  private _byRoute: Map<string, string> = new Map();

  /**
   * Register a channel adapter.
   */
  register(id: string, config: ChannelConfig, adapter: ChannelAdapter): void {
    this._byId.set(id, { config, adapter });
    if (config.webhook_path) {
      this._byRoute.set(config.webhook_path, id);
    }
  }

  /**
   * Get adapter by channel ID.
   */
  getById(id: string): ChannelRegistryEntry | undefined {
    return this._byId.get(id);
  }

  /**
   * Get adapter by webhook route path.
   */
  getByRoute(routePath: string): (ChannelRegistryEntry & { id: string }) | undefined {
    const id = this._byRoute.get(routePath);
    if (!id) return undefined;
    const entry = this._byId.get(id);
    if (!entry) return undefined;
    return { id, ...entry };
  }

  /**
   * Get all webhook paths (for PUBLIC_ROUTES).
   */
  getWebhookPaths(): string[] {
    return Array.from(this._byRoute.keys());
  }

  /**
   * Get all registered channels.
   */
  getAll(): Array<{ id: string; type: string; enabled: boolean; webhook_path?: string }> {
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
  get size(): number {
    return this._byId.size;
  }
}

/**
 * Get the global channel registry singleton.
 * Uses globalThis to survive Turbopack module re-instantiation.
 */
export function getChannelRegistry(): ChannelRegistry {
  if (!globalThis.__mantisChannelRegistry) {
    globalThis.__mantisChannelRegistry = new ChannelRegistry();
  }
  return globalThis.__mantisChannelRegistry;
}

/**
 * Initialize the channel registry from CHANNELS.json.
 * Creates adapters for each enabled channel.
 * Falls back to env-var Telegram if no CHANNELS.json.
 */
export async function initChannelRegistry(): Promise<ChannelRegistry> {
  const registry = getChannelRegistry();

  let channels: ChannelConfig[] = [];

  // Try loading CHANNELS.json
  try {
    if (fs.existsSync(channelsFile)) {
      channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
    }
  } catch (err: unknown) {
    console.error('[channels] Failed to parse CHANNELS.json:', (err as Error).message);
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
    } catch (err: unknown) {
      console.error(`[channels] Failed to initialize ${channel.id}:`, (err as Error).message);
    }
  }

  return registry;
}

/**
 * Create an adapter instance for a channel config.
 */
async function createAdapterForChannel(channel: ChannelConfig): Promise<ChannelAdapter | null> {
  switch (channel.type) {
    case 'telegram': {
      const { TelegramAdapter } = await import('./telegram.js');
      const botToken = process.env[channel.config.bot_token_env];
      if (!botToken) {
        console.warn(`[channels] ${channel.id}: ${channel.config.bot_token_env} not set`);
        return null;
      }
      return new TelegramAdapter(botToken, channel as unknown as Record<string, unknown>);
    }

    case 'slack': {
      const { SlackAdapter } = await import('./slack.js');
      const botToken = process.env[channel.config.bot_token_env];
      const signingSecret = process.env[channel.config.signing_secret_env];
      if (!botToken || !signingSecret) {
        console.warn(`[channels] ${channel.id}: Slack credentials not set`);
        return null;
      }
      return new SlackAdapter(botToken, signingSecret, channel as unknown as Record<string, unknown>);
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
      return new DiscordAdapter(botToken, applicationId!, publicKey, channel as unknown as Record<string, unknown>);
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
      return new WhatsAppAdapter(phoneNumberId, accessToken, verifyToken!, appSecret!, channel as unknown as Record<string, unknown>);
    }

    default:
      console.warn(`[channels] Unknown channel type: ${channel.type}`);
      return null;
  }
}

export { ChannelRegistry };
