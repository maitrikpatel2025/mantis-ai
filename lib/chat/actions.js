'use server';

import { auth } from '../auth/index.js';
import {
  createChat as dbCreateChat,
  getChatById,
  getMessagesByChatId,
  deleteChat as dbDeleteChat,
  deleteAllChatsByUser,
  updateChatTitle,
  toggleChatStarred,
} from '../db/chats.js';
import {
  getNotifications as dbGetNotifications,
  getUnreadCount as dbGetUnreadCount,
  markAllRead as dbMarkAllRead,
} from '../db/notifications.js';

/**
 * Get the authenticated user or throw.
 */
async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return session.user;
}

/**
 * Get all chats for the authenticated user (includes Telegram chats).
 * @returns {Promise<object[]>}
 */
export async function getChats() {
  const user = await requireAuth();
  const { or, eq, desc } = await import('drizzle-orm');
  const { getDb } = await import('../db/index.js');
  const { chats } = await import('../db/schema.js');
  const db = getDb();
  return db
    .select()
    .from(chats)
    .where(or(eq(chats.userId, user.id), eq(chats.userId, 'telegram')))
    .orderBy(desc(chats.updatedAt))
    .all();
}

/**
 * Get messages for a specific chat (with ownership check).
 * @param {string} chatId
 * @returns {Promise<object[]>}
 */
export async function getChatMessages(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || (chat.userId !== user.id && chat.userId !== 'telegram')) {
    return [];
  }
  return getMessagesByChatId(chatId);
}

/**
 * Create a new chat.
 * @param {string} [id] - Optional chat ID
 * @param {string} [title='New Chat']
 * @returns {Promise<object>}
 */
export async function createChat(id, title = 'New Chat') {
  const user = await requireAuth();
  return dbCreateChat(user.id, title, id);
}

/**
 * Delete a chat (with ownership check).
 * @param {string} chatId
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteChat(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  dbDeleteChat(chatId);
  return { success: true };
}

/**
 * Rename a chat (with ownership check).
 * @param {string} chatId
 * @param {string} title
 * @returns {Promise<{success: boolean}>}
 */
export async function renameChat(chatId, title) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  updateChatTitle(chatId, title);
  return { success: true };
}

/**
 * Toggle a chat's starred status (with ownership check).
 * @param {string} chatId
 * @returns {Promise<{success: boolean, starred?: number}>}
 */
export async function starChat(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  const starred = toggleChatStarred(chatId);
  return { success: true, starred };
}

/**
 * Delete all chats for the authenticated user.
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteAllChats() {
  const user = await requireAuth();
  deleteAllChatsByUser(user.id);
  return { success: true };
}

/**
 * Get all notifications, newest first.
 * @returns {Promise<object[]>}
 */
export async function getNotifications() {
  await requireAuth();
  return dbGetNotifications();
}

/**
 * Get count of unread notifications.
 * @returns {Promise<number>}
 */
export async function getUnreadNotificationCount() {
  await requireAuth();
  return dbGetUnreadCount();
}

/**
 * Mark all notifications as read.
 * @returns {Promise<{success: boolean}>}
 */
export async function markNotificationsRead() {
  await requireAuth();
  dbMarkAllRead();
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// App info actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the installed package version and update status (auth-gated, never in client bundle).
 * @returns {Promise<{ version: string, updateAvailable: string|null }>}
 */
export async function getAppVersion() {
  await requireAuth();
  const { getInstalledVersion } = await import('../cron.js');
  const { getAvailableVersion } = await import('../db/update-check.js');
  return { version: getInstalledVersion(), updateAvailable: getAvailableVersion() };
}

/**
 * Trigger the upgrade-event-handler workflow via GitHub Actions.
 * @returns {Promise<{ success: boolean }>}
 */
export async function triggerUpgrade() {
  await requireAuth();
  const { triggerWorkflowDispatch } = await import('../tools/github.js');
  await triggerWorkflowDispatch('upgrade-event-handler.yml');
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// API Key actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create (or replace) the API key.
 * @returns {Promise<{ key: string, record: object } | { error: string }>}
 */
export async function createNewApiKey() {
  const user = await requireAuth();
  try {
    const { createApiKeyRecord } = await import('../db/api-keys.js');
    return createApiKeyRecord(user.id);
  } catch (err) {
    console.error('Failed to create API key:', err);
    return { error: 'Failed to create API key' };
  }
}

/**
 * Get the current API key metadata (no hash).
 * @returns {Promise<object|null>}
 */
export async function getApiKeys() {
  await requireAuth();
  try {
    const { getApiKey } = await import('../db/api-keys.js');
    return getApiKey();
  } catch (err) {
    console.error('Failed to get API key:', err);
    return null;
  }
}

/**
 * Delete the API key.
 * @returns {Promise<{ success: boolean } | { error: string }>}
 */
export async function deleteApiKey() {
  await requireAuth();
  try {
    const mod = await import('../db/api-keys.js');
    mod.deleteApiKey();
    return { success: true };
  } catch (err) {
    console.error('Failed to delete API key:', err);
    return { error: 'Failed to delete API key' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Swarm actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get swarm status (active + completed jobs with counts).
 * @returns {Promise<object>}
 */
export async function getSwarmStatus(page = 1) {
  await requireAuth();
  try {
    const { getSwarmStatus: fetchStatus } = await import('../tools/github.js');
    return await fetchStatus(page);
  } catch (err) {
    console.error('Failed to get swarm status:', err);
    return { error: 'Failed to get swarm status', runs: [], hasMore: false };
  }
}

/**
 * Get swarm config (crons + triggers).
 * @returns {Promise<{ crons: object[], triggers: object[] }>}
 */
// ─────────────────────────────────────────────────────────────────────────────
// Skills actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the list of installed skills.
 * @returns {Promise<object[]>}
 */
export async function getSkillsList() {
  await requireAuth();
  try {
    const { listSkills } = await import('../skills/index.js');
    return listSkills();
  } catch (err) {
    console.error('Failed to list skills:', err);
    return [];
  }
}

/**
 * Search the remote skill registry.
 * @param {string} query
 * @returns {Promise<object[]>}
 */
export async function searchSkillsAction(query) {
  await requireAuth();
  try {
    const { searchRegistry } = await import('../skills/index.js');
    return await searchRegistry(query);
  } catch (err) {
    console.error('Failed to search skills:', err);
    return [];
  }
}

/**
 * Install a skill from the remote registry.
 * @param {string} name
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function installSkillAction(name) {
  await requireAuth();
  try {
    const { installSkill } = await import('../skills/index.js');
    return await installSkill(name);
  } catch (err) {
    console.error('Failed to install skill:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Toggle a skill's enabled state.
 * @param {string} name
 * @param {boolean} enabled
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function toggleSkillAction(name, enabled) {
  await requireAuth();
  try {
    const { toggleSkill } = await import('../skills/index.js');
    return toggleSkill(name, enabled);
  } catch (err) {
    console.error('Failed to toggle skill:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Remove a skill (files + symlink + manifest).
 * @param {string} name
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function removeSkillAction(name) {
  await requireAuth();
  try {
    const { removeSkill } = await import('../skills/index.js');
    return removeSkill(name);
  } catch (err) {
    console.error('Failed to remove skill:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Check for available skill updates from the registry.
 * @returns {Promise<object[]>} Array of { name, currentVersion, latestVersion }
 */
export async function checkSkillUpdatesAction() {
  await requireAuth();
  try {
    const { checkUpdates } = await import('../skills/index.js');
    return await checkUpdates();
  } catch (err) {
    console.error('Failed to check skill updates:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Channels actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the list of configured channels.
 * @returns {Promise<object[]>}
 */
export async function getChannelsList() {
  await requireAuth();
  try {
    const { getChannelRegistry } = await import('../channels/registry.js');
    const registry = getChannelRegistry();
    return registry.getAll();
  } catch (err) {
    console.error('Failed to list channels:', err);
    // Fallback: read CHANNELS.json directly
    try {
      const fs = await import('fs');
      const { channelsFile } = await import('../paths.js');
      if (fs.existsSync(channelsFile)) {
        const channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
        return channels.map((c) => ({
          id: c.id,
          type: c.type,
          enabled: c.enabled,
          webhook_path: c.webhook_path,
        }));
      }
    } catch {}
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agents actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the list of configured sub-agents.
 * @returns {Promise<object[]>}
 */
export async function getAgentsList() {
  await requireAuth();
  try {
    const { loadAgentConfigs } = await import('../ai/sub-agents.js');
    const configs = loadAgentConfigs();
    return configs.map((c) => ({
      name: c._name || c.name,
      description: c.description || '',
      tools: c.tools || [],
      model: c.model || null,
      enabled: c.enabled !== false,
    }));
  } catch (err) {
    console.error('Failed to list agents:', err);
    return [];
  }
}

export async function getSwarmConfig() {
  await requireAuth();
  const { cronsFile, triggersFile } = await import('../paths.js');
  const fs = await import('fs');
  let crons = [];
  let triggers = [];
  try { crons = JSON.parse(fs.readFileSync(cronsFile, 'utf8')); } catch {}
  try { triggers = JSON.parse(fs.readFileSync(triggersFile, 'utf8')); } catch {}
  return { crons, triggers };
}

