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
    const result = await fetchStatus(page);

    // Merge DB data (prompt, summary, status) into GitHub API results where available
    try {
      const { getJobById } = await import('../db/jobs.js');
      if (result.runs) {
        for (const run of result.runs) {
          if (run.job_id) {
            const dbJob = getJobById(run.job_id);
            if (dbJob) {
              run.prompt = dbJob.prompt;
              run.summary = dbJob.summary;
              run.dbStatus = dbJob.status;
              run.source = dbJob.source;
            }
          }
        }
      }
    } catch {
      // DB merge is best-effort
    }

    return result;
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
      displayName: c.displayName || null,
      avatar: c.avatar || null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Models catalog action
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the available models catalog from config/MODELS.json.
 * @returns {Promise<{ available: Array<{ id: string, label: string }> } | null>}
 */
export async function getModelsCatalog() {
  await requireAuth();
  try {
    const { loadModelsCatalog } = await import('../ai/models-catalog.js');
    return loadModelsCatalog();
  } catch (err) {
    console.error('Failed to load models catalog:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardData() {
  await requireAuth();
  try {
    const fs = await import('fs');
    const { mantisDb, cronsFile, agentsDir } = await import('../paths.js');

    // Uptime
    const uptimeMs = process.uptime() * 1000;

    // DB size
    let dbSizeBytes = 0;
    try { dbSizeBytes = fs.statSync(mantisDb).size; } catch {}

    // Active channels
    let activeChannels = 0;
    try {
      const { getChannelRegistry } = await import('../channels/registry.js');
      activeChannels = getChannelRegistry().getAll().filter((c) => c.enabled).length;
    } catch {}

    // Active crons
    let activeCrons = 0;
    try {
      if (fs.existsSync(cronsFile)) {
        const crons = JSON.parse(fs.readFileSync(cronsFile, 'utf8'));
        activeCrons = crons.filter((c) => c.enabled !== false).length;
      }
    } catch {}

    // Total agents
    let totalAgents = 0;
    try {
      if (fs.existsSync(agentsDir)) {
        totalAgents = fs.readdirSync(agentsDir).filter((d) =>
          fs.statSync(`${agentsDir}/${d}`).isDirectory()
        ).length;
      }
    } catch {}

    // Recent notifications
    let recentNotifications = [];
    try {
      const { getNotifications } = await import('../db/notifications.js');
      recentNotifications = getNotifications().slice(0, 5);
    } catch {}

    // Job counts
    let jobCounts = { created: 0, queued: 0, completed: 0, failed: 0 };
    try {
      const { getJobCounts } = await import('../db/jobs.js');
      jobCounts = getJobCounts();
    } catch {}

    // Warm pool status
    let warmPool = null;
    try {
      const { getWarmPool } = await import('../execution/warm-pool.js');
      const pool = getWarmPool();
      if (pool) warmPool = pool.getStatus();
    } catch {}

    return {
      uptimeMs,
      dbSizeBytes,
      activeChannels,
      activeCrons,
      totalAgents,
      nodeVersion: process.version,
      recentNotifications,
      jobCounts,
      warmPool,
    };
  } catch (err) {
    console.error('Failed to get dashboard data:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Log viewer actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getLogsAction(filters = {}) {
  await requireAuth();
  try {
    const { getLogBuffer } = await import('../logs/buffer.js');
    return getLogBuffer().getAll(filters);
  } catch (err) {
    return [];
  }
}

export async function clearLogsAction() {
  await requireAuth();
  try {
    const { getLogBuffer } = await import('../logs/buffer.js');
    getLogBuffer().clear();
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage analytics actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getUsageStatsAction(period = '7d') {
  await requireAuth();
  try {
    const { getUsageStats } = await import('../db/usage.js');
    return getUsageStats(period);
  } catch (err) {
    console.error('Failed to get usage stats:', err);
    return { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCostUsd: 0, avgDurationMs: 0 };
  }
}

export async function getUsageByModelAction(period = '7d') {
  await requireAuth();
  try {
    const { getUsageByModel } = await import('../db/usage.js');
    return getUsageByModel(period);
  } catch (err) {
    console.error('Failed to get usage by model:', err);
    return [];
  }
}

export async function getUsageByDayAction(days = 7) {
  await requireAuth();
  try {
    const { getUsageByDay } = await import('../db/usage.js');
    return getUsageByDay(days);
  } catch (err) {
    console.error('Failed to get usage by day:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getDebugInfoAction() {
  await requireAuth();
  try {
    const { getDebugInfo } = await import('../debug/index.js');
    return await getDebugInfo();
  } catch (err) {
    console.error('Failed to get debug info:', err);
    return null;
  }
}

export async function testLlmConnectionAction() {
  await requireAuth();
  try {
    const { testLlmConnection } = await import('../debug/index.js');
    return await testLlmConnection();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function resetAgentCacheAction() {
  await requireAuth();
  try {
    const { resetAgentCache } = await import('../debug/index.js');
    return resetAgentCache();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function clearCheckpointsAction() {
  await requireAuth();
  try {
    const { clearCheckpoints } = await import('../debug/index.js');
    return clearCheckpoints();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Security actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getSecurityPolicies() {
  await requireAuth();
  try {
    const { getAllPolicies } = await import('../security/policies.js');
    return getAllPolicies();
  } catch (err) {
    console.error('Failed to get security policies:', err);
    return [];
  }
}

export async function updateToolPolicy(agent, tool, policy) {
  await requireAuth();
  try {
    const { setToolPolicy } = await import('../security/policies.js');
    setToolPolicy(agent, tool, policy);
    // Reset agent cache so new policy takes effect
    const { resetAgent } = await import('../ai/agent.js');
    resetAgent();
    return { success: true };
  } catch (err) {
    console.error('Failed to update tool policy:', err);
    return { success: false, message: err.message };
  }
}

export async function getPendingApprovals() {
  await requireAuth();
  try {
    const { getPendingApprovals: fetchPending } = await import('../security/approval.js');
    return fetchPending();
  } catch (err) {
    console.error('Failed to get pending approvals:', err);
    return [];
  }
}

export async function respondToApproval(id, approved) {
  await requireAuth();
  try {
    if (approved) {
      const { approveRequest } = await import('../security/approval.js');
      approveRequest(id);
    } else {
      const { denyRequest } = await import('../security/approval.js');
      denyRequest(id);
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to respond to approval:', err);
    return { success: false };
  }
}

export async function getToolNames() {
  await requireAuth();
  try {
    const { toolRegistry } = await import('../ai/tools.js');
    return Object.keys(toolRegistry);
  } catch (err) {
    console.error('Failed to get tool names:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session monitoring actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getActiveSessions() {
  await requireAuth();
  try {
    const { getDb } = await import('../db/index.js');
    const { chats, messages } = await import('../db/schema.js');
    const { gte, sql, desc } = await import('drizzle-orm');
    const db = getDb();
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;

    const rows = db
      .select({
        id: chats.id,
        title: chats.title,
        userId: chats.userId,
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
        messageCount: sql`(SELECT COUNT(*) FROM messages WHERE messages.chat_id = ${chats.id})`,
      })
      .from(chats)
      .where(gte(chats.updatedAt, thirtyMinAgo))
      .orderBy(desc(chats.updatedAt))
      .all();

    return rows;
  } catch (err) {
    console.error('Failed to get active sessions:', err);
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

// ─────────────────────────────────────────────────────────────────────────────
// Cron CRUD actions
// ─────────────────────────────────────────────────────────────────────────────

async function readCronsFile() {
  const fs = await import('fs');
  const { cronsFile } = await import('../paths.js');
  try {
    return JSON.parse(fs.readFileSync(cronsFile, 'utf8'));
  } catch {
    return [];
  }
}

async function writeCronsFile(crons) {
  const fs = await import('fs');
  const { cronsFile } = await import('../paths.js');
  fs.writeFileSync(cronsFile, JSON.stringify(crons, null, 2) + '\n', 'utf8');
  try {
    const { reloadCrons } = await import('../cron.js');
    reloadCrons();
  } catch {}
}

export async function getCronsList() {
  await requireAuth();
  return readCronsFile();
}

export async function createCron(data) {
  await requireAuth();
  const { validateSchedule } = await import('../cron.js');
  if (!data.name || !data.schedule) return { success: false, message: 'Name and schedule are required' };
  if (!validateSchedule(data.schedule)) return { success: false, message: 'Invalid cron schedule' };

  const crons = await readCronsFile();
  const entry = {
    name: data.name,
    schedule: data.schedule,
    type: data.type || 'agent',
    enabled: data.enabled !== false,
  };
  if (entry.type === 'agent') entry.job = data.job || '';
  if (entry.type === 'command') entry.command = data.command || '';
  if (entry.type === 'webhook') {
    entry.url = data.url || '';
    if (data.method) entry.method = data.method;
    if (data.headers) entry.headers = data.headers;
    if (data.vars) entry.vars = data.vars;
  }
  crons.push(entry);
  await writeCronsFile(crons);
  return { success: true };
}

export async function updateCron(index, data) {
  await requireAuth();
  const { validateSchedule } = await import('../cron.js');
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: 'Invalid index' };
  if (data.schedule && !validateSchedule(data.schedule)) return { success: false, message: 'Invalid cron schedule' };

  crons[index] = { ...crons[index], ...data };
  await writeCronsFile(crons);
  return { success: true };
}

export async function deleteCron(index) {
  await requireAuth();
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: 'Invalid index' };
  crons.splice(index, 1);
  await writeCronsFile(crons);
  return { success: true };
}

export async function toggleCronEnabled(index) {
  await requireAuth();
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: 'Invalid index' };
  crons[index].enabled = crons[index].enabled === false ? true : false;
  await writeCronsFile(crons);
  return { success: true, enabled: crons[index].enabled };
}

// ─────────────────────────────────────────────────────────────────────────────
// Jobs actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get paginated job list from DB.
 * @param {number} [page=1]
 * @param {string} [status]
 * @returns {Promise<object[]>}
 */
export async function getJobs(page = 1, status) {
  await requireAuth();
  try {
    const { getRecentJobs } = await import('../db/jobs.js');
    const limit = 20;
    const offset = (page - 1) * limit;
    return getRecentJobs({ limit, offset, status });
  } catch (err) {
    console.error('Failed to get jobs:', err);
    return [];
  }
}

/**
 * Get a single job by ID.
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function getJob(jobId) {
  await requireAuth();
  try {
    const { getJobById } = await import('../db/jobs.js');
    return getJobById(jobId) || null;
  } catch (err) {
    console.error('Failed to get job:', err);
    return null;
  }
}

/**
 * Get job counts grouped by status for dashboard.
 * @returns {Promise<object>}
 */
export async function getJobDashboardCounts() {
  await requireAuth();
  try {
    const { getJobCounts } = await import('../db/jobs.js');
    return getJobCounts();
  } catch (err) {
    console.error('Failed to get job counts:', err);
    return { created: 0, queued: 0, completed: 0, failed: 0 };
  }
}

/**
 * Cancel a running job.
 * @param {string} jobId
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function cancelJobAction(jobId) {
  await requireAuth();
  try {
    const { getJobById, updateJob } = await import('../db/jobs.js');
    const job = getJobById(jobId);
    if (!job) return { success: false, message: 'Job not found' };
    if (job.status !== 'created' && job.status !== 'queued') {
      return { success: false, message: `Job is ${job.status}, not cancellable` };
    }

    if (job.runnerType === 'warm') {
      try {
        const { getWarmPool } = await import('../execution/warm-pool.js');
        const pool = getWarmPool();
        if (pool) pool.cancelJob(jobId);
      } catch {}
    } else if (job.runnerType === 'local') {
      const { cancelLocalJob } = await import('../execution/local-runner.js');
      cancelLocalJob(jobId);
    } else if (job.branch) {
      const { findWorkflowRunForBranch, cancelWorkflowRun } = await import('../tools/github.js');
      const runId = await findWorkflowRunForBranch(job.branch);
      if (runId) await cancelWorkflowRun(runId);
    }

    // Re-read job to check for race with completion
    const current = getJobById(jobId);
    if (current && (current.status === 'created' || current.status === 'queued')) {
      updateJob(jobId, { status: 'failed', completedAt: Date.now(), error: 'Cancelled by user' });
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to cancel job:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Retry a job by creating a new one with the same prompt.
 * @param {string} jobId
 * @returns {Promise<{ success: boolean, newJobId?: string, message?: string }>}
 */
export async function retryJobAction(jobId) {
  await requireAuth();
  try {
    const { getJobById } = await import('../db/jobs.js');
    const job = getJobById(jobId);
    if (!job) return { success: false, message: 'Job not found' };

    const { createJob } = await import('../tools/create-job.js');
    const result = await createJob(job.prompt, { source: job.source, chatId: job.chatId });
    return { success: true, newJobId: result.job_id };
  } catch (err) {
    console.error('Failed to retry job:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Get warm pool status.
 * @returns {Promise<object|null>}
 */
export async function getWarmPoolStatus() {
  await requireAuth();
  try {
    const { getWarmPool } = await import('../execution/warm-pool.js');
    const pool = getWarmPool();
    return pool ? pool.getStatus() : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get memories, optionally filtered by category.
 * @param {string} [category]
 * @returns {Promise<object[]>}
 */
export async function getMemoriesAction(category) {
  await requireAuth();
  try {
    const { getMemories } = await import('../db/memories.js');
    return getMemories({ category });
  } catch (err) {
    console.error('Failed to get memories:', err);
    return [];
  }
}

/**
 * Search memories by query.
 * @param {string} query
 * @param {string} [category]
 * @returns {Promise<object[]>}
 */
export async function searchMemoriesAction(query, category) {
  await requireAuth();
  try {
    const { searchMemories } = await import('../db/memories.js');
    return searchMemories(query, { category });
  } catch (err) {
    console.error('Failed to search memories:', err);
    return [];
  }
}

/**
 * Manually create a memory.
 * @param {string} content
 * @param {string} [category='general']
 * @returns {Promise<object|{ error: string }>}
 */
export async function createMemoryAction(content, category = 'general') {
  await requireAuth();
  try {
    const { createMemory } = await import('../db/memories.js');
    return createMemory({ content, category });
  } catch (err) {
    console.error('Failed to create memory:', err);
    return { error: 'Failed to create memory' };
  }
}

/**
 * Delete a memory.
 * @param {string} id
 * @returns {Promise<{ success: boolean }>}
 */
export async function deleteMemoryAction(id) {
  await requireAuth();
  try {
    const { deleteMemory } = await import('../db/memories.js');
    deleteMemory(id);
    return { success: true };
  } catch (err) {
    console.error('Failed to delete memory:', err);
    return { success: false };
  }
}

/**
 * Update a memory.
 * @param {string} id
 * @param {object} fields - { content, category, relevance }
 * @returns {Promise<{ success: boolean }>}
 */
export async function updateMemoryAction(id, fields) {
  await requireAuth();
  try {
    const { updateMemory } = await import('../db/memories.js');
    updateMemory(id, fields);
    return { success: true };
  } catch (err) {
    console.error('Failed to update memory:', err);
    return { success: false };
  }
}

