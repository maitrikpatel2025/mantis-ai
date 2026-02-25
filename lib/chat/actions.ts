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
import type { CronJobConfig, TriggerConfig, ToolPolicyDecision } from '../types.js';

// ---------------------------------------------------------------------------
// Shared types for action results
// ---------------------------------------------------------------------------

interface SuccessResult {
  success: boolean;
}

interface ErrorResult {
  error: string;
}

interface AuthUser {
  id: string;
  email?: string | null;
  role?: string;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * Get the authenticated user or throw.
 */
async function requireAuth(): Promise<AuthUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return session.user as AuthUser;
}

// ---------------------------------------------------------------------------
// Chat actions
// ---------------------------------------------------------------------------

/**
 * Get all chats for the authenticated user (includes Telegram chats).
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
 */
export async function getChatMessages(chatId: string) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || (chat.userId !== user.id && chat.userId !== 'telegram')) {
    return [];
  }
  return getMessagesByChatId(chatId);
}

/**
 * Create a new chat.
 */
export async function createChat(id?: string, title: string = 'New Chat') {
  const user = await requireAuth();
  return dbCreateChat(user.id, title, id ?? null);
}

/**
 * Delete a chat (with ownership check).
 */
export async function deleteChat(chatId: string): Promise<SuccessResult> {
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
 */
export async function renameChat(chatId: string, title: string): Promise<SuccessResult> {
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
 */
export async function starChat(chatId: string): Promise<SuccessResult & { starred?: number }> {
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
 */
export async function deleteAllChats(): Promise<SuccessResult> {
  const user = await requireAuth();
  deleteAllChatsByUser(user.id);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Notification actions
// ---------------------------------------------------------------------------

/**
 * Get all notifications, newest first.
 */
export async function getNotifications() {
  await requireAuth();
  return dbGetNotifications();
}

/**
 * Get count of unread notifications.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  await requireAuth();
  return dbGetUnreadCount();
}

/**
 * Mark all notifications as read.
 */
export async function markNotificationsRead(): Promise<SuccessResult> {
  await requireAuth();
  dbMarkAllRead();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Health actions
// ---------------------------------------------------------------------------

export async function getHealthStatusAction() {
  await requireAuth();
  try {
    const { getHealthStatus } = await import('../health/index.js');
    return getHealthStatus();
  } catch (err) {
    return { overall: 'unknown' as const, components: {} as Record<string, never> };
  }
}

export async function getGatewayStatusAction() {
  await requireAuth();
  try {
    const { getGateway } = await import('../gateway/index.js');
    const gw = getGateway();
    if (!gw) return { running: false, connections: 0, sessions: [] };
    return {
      running: true,
      connections: gw.connectionCount,
      sessions: gw.getSessions(),
    };
  } catch (err) {
    return { running: false, connections: 0, sessions: [] };
  }
}

// ---------------------------------------------------------------------------
// App info actions
// ---------------------------------------------------------------------------

interface AppVersionResult {
  version: string;
  updateAvailable: string | null;
}

/**
 * Get the installed package version and update status (auth-gated, never in client bundle).
 */
export async function getAppVersion(): Promise<AppVersionResult> {
  await requireAuth();
  const { getInstalledVersion } = await import('../cron.js');
  const { getAvailableVersion } = await import('../db/update-check.js');
  return { version: getInstalledVersion(), updateAvailable: getAvailableVersion() };
}

/**
 * Trigger the upgrade-event-handler workflow via GitHub Actions.
 */
export async function triggerUpgrade(): Promise<SuccessResult> {
  await requireAuth();
  const { triggerWorkflowDispatch } = await import('../tools/github.js');
  await triggerWorkflowDispatch('upgrade-event-handler.yml');
  return { success: true };
}

// ---------------------------------------------------------------------------
// API Key actions
// ---------------------------------------------------------------------------

interface ApiKeyCreateResult {
  key?: string;
  record?: {
    id: string;
    keyPrefix: string;
    createdAt: number;
    lastUsedAt: number | null;
  };
  error?: string;
}

interface ApiKeyMetadata {
  id: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/**
 * Create (or replace) the API key.
 */
export async function createNewApiKey(): Promise<ApiKeyCreateResult> {
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
 */
export async function getApiKeys(): Promise<ApiKeyMetadata | null> {
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
 */
export async function deleteApiKey(): Promise<SuccessResult | ErrorResult> {
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

// ---------------------------------------------------------------------------
// Swarm actions
// ---------------------------------------------------------------------------

/**
 * Get swarm status (active + completed jobs with counts).
 */
export async function getSwarmStatus(page: number = 1) {
  await requireAuth();
  try {
    const { getSwarmStatus: fetchStatus } = await import('../tools/github.js');
    const result = await fetchStatus(page);

    // Merge DB data (prompt, summary, status) into GitHub API results where available
    try {
      const { getJobById } = await import('../db/jobs.js');
      if (result.runs) {
        for (const run of result.runs as unknown as Array<Record<string, unknown>>) {
          if (run.job_id) {
            const dbJob = getJobById(run.job_id as string);
            if (dbJob) {
              run.prompt = dbJob.prompt;
              run.summary = dbJob.summary ?? undefined;
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
    return { error: 'Failed to get swarm status', runs: [] as Array<Record<string, unknown>>, hasMore: false };
  }
}

// ---------------------------------------------------------------------------
// Skills actions
// ---------------------------------------------------------------------------

/**
 * Get the list of installed skills.
 */
export async function getSkillsList() {
  await requireAuth();
  try {
    const { listSkills } = await import('../skills/index.js');
    return listSkills();
  } catch (err) {
    console.error('Failed to list skills:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

/**
 * Search the remote skill registry.
 */
export async function searchSkillsAction(query: string) {
  await requireAuth();
  try {
    const { searchRegistry } = await import('../skills/index.js');
    return await searchRegistry(query);
  } catch (err) {
    console.error('Failed to search skills:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

/**
 * Install a skill from the remote registry.
 */
export async function installSkillAction(name: string) {
  await requireAuth();
  try {
    const { installSkill } = await import('../skills/index.js');
    return await installSkill(name);
  } catch (err) {
    console.error('Failed to install skill:', err);
    return { success: false, message: (err as Error).message };
  }
}

/**
 * Toggle a skill's enabled state.
 */
export async function toggleSkillAction(name: string, enabled: boolean) {
  await requireAuth();
  try {
    const { toggleSkill } = await import('../skills/index.js');
    return toggleSkill(name, enabled);
  } catch (err) {
    console.error('Failed to toggle skill:', err);
    return { success: false, message: (err as Error).message };
  }
}

/**
 * Remove a skill (files + symlink + manifest).
 */
export async function removeSkillAction(name: string) {
  await requireAuth();
  try {
    const { removeSkill } = await import('../skills/index.js');
    return removeSkill(name);
  } catch (err) {
    console.error('Failed to remove skill:', err);
    return { success: false, message: (err as Error).message };
  }
}

/**
 * Check for available skill updates from the registry.
 */
export async function checkSkillUpdatesAction() {
  await requireAuth();
  try {
    const { checkUpdates } = await import('../skills/index.js');
    return await checkUpdates();
  } catch (err) {
    console.error('Failed to check skill updates:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

// ---------------------------------------------------------------------------
// Channels actions
// ---------------------------------------------------------------------------

interface ChannelListItem {
  id: string;
  type: string;
  enabled: boolean;
  webhook_path?: string;
  [key: string]: unknown;
}

/**
 * Get the list of configured channels.
 */
export async function getChannelsList(): Promise<ChannelListItem[]> {
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
        const channels: Array<{ id: string; type: string; enabled: boolean; webhook_path?: string }> = JSON.parse(
          fs.readFileSync(channelsFile, 'utf8')
        );
        return channels.map((c) => ({
          id: c.id,
          type: c.type,
          enabled: c.enabled,
          webhook_path: c.webhook_path,
        }));
      }
    } catch {
      // ignore fallback errors
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Channel metrics actions
// ---------------------------------------------------------------------------

export async function getChannelMetricsAction(): Promise<Record<string, unknown>> {
  await requireAuth();
  try {
    const { getChannelMetrics } = await import('../channels/metrics.js');
    return getChannelMetrics();
  } catch (err) {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Agents actions
// ---------------------------------------------------------------------------

interface AgentListItem {
  name: string;
  displayName: string | null;
  avatar: string | null;
  description: string;
  tools: string[];
  model: string | null;
  enabled: boolean;
}

/**
 * Get the list of configured sub-agents.
 */
export async function getAgentsList(): Promise<AgentListItem[]> {
  await requireAuth();
  try {
    const { loadAgentConfigs } = await import('../ai/sub-agents.js');
    const configs = loadAgentConfigs();
    return configs.map((c: Record<string, unknown>) => ({
      name: (c._name as string) || (c.name as string),
      displayName: (c.displayName as string) || null,
      avatar: (c.avatar as string) || null,
      description: (c.description as string) || '',
      tools: (c.tools as string[]) || [],
      model: (c.model as string) || null,
      enabled: c.enabled !== false,
    }));
  } catch (err) {
    console.error('Failed to list agents:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Models catalog action
// ---------------------------------------------------------------------------

/**
 * Get the available models catalog from config/MODELS.json.
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

// ---------------------------------------------------------------------------
// Dashboard actions
// ---------------------------------------------------------------------------

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
      activeChannels = getChannelRegistry().getAll().filter((c: { enabled: boolean }) => c.enabled).length;
    } catch {}

    // Active crons
    let activeCrons = 0;
    try {
      if (fs.existsSync(cronsFile)) {
        const crons: CronJobConfig[] = JSON.parse(fs.readFileSync(cronsFile, 'utf8'));
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
    let recentNotifications: Array<Record<string, unknown>> = [];
    try {
      const { getNotifications } = await import('../db/notifications.js');
      recentNotifications = getNotifications().slice(0, 5);
    } catch {}

    // Job counts
    let jobCounts: Record<string, number> = { created: 0, queued: 0, completed: 0, failed: 0 };
    try {
      const { getJobCounts } = await import('../db/jobs.js');
      jobCounts = getJobCounts();
    } catch {}

    // Warm pool status
    let warmPool: Record<string, unknown> | null = null;
    try {
      const { getWarmPool } = await import('../execution/warm-pool.js');
      const pool = getWarmPool();
      if (pool) warmPool = pool.getStatus() as unknown as Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// Log viewer actions
// ---------------------------------------------------------------------------

interface LogFilters {
  level?: string;
  source?: string;
}

export async function getLogsAction(filters: LogFilters = {}) {
  await requireAuth();
  try {
    const { getLogBuffer } = await import('../logs/buffer.js');
    return getLogBuffer().getAll(filters);
  } catch (err) {
    return [] as Array<Record<string, unknown>>;
  }
}

export async function clearLogsAction(): Promise<SuccessResult> {
  await requireAuth();
  try {
    const { getLogBuffer } = await import('../logs/buffer.js');
    getLogBuffer().clear();
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// Usage analytics actions
// ---------------------------------------------------------------------------

export async function getUsageStatsAction(period: '24h' | '7d' | '30d' | 'all' = '7d') {
  await requireAuth();
  try {
    const { getUsageStats } = await import('../db/usage.js');
    return getUsageStats(period);
  } catch (err) {
    console.error('Failed to get usage stats:', err);
    return { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCostUsd: 0, avgDurationMs: 0 };
  }
}

export async function getUsageByModelAction(period: '24h' | '7d' | '30d' | 'all' = '7d') {
  await requireAuth();
  try {
    const { getUsageByModel } = await import('../db/usage.js');
    return getUsageByModel(period);
  } catch (err) {
    console.error('Failed to get usage by model:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

export async function getUsageByDayAction(days: number = 7) {
  await requireAuth();
  try {
    const { getUsageByDay } = await import('../db/usage.js');
    return getUsageByDay(days);
  } catch (err) {
    console.error('Failed to get usage by day:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

export async function getUsageBySourceAction(period: '24h' | '7d' | '30d' | 'all' = '7d') {
  await requireAuth();
  try {
    const { getUsageBySource } = await import('../db/usage.js');
    return getUsageBySource(period);
  } catch (err) {
    console.error('Failed to get usage by source:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

export async function getTokenBreakdownByDayAction(days: number = 7) {
  await requireAuth();
  try {
    const { getTokenBreakdownByDay } = await import('../db/usage.js');
    return getTokenBreakdownByDay(days);
  } catch (err) {
    console.error('Failed to get token breakdown:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

interface SparklinePoint {
  day: string;
  value: number;
}

interface DashboardCharts {
  tokenSparkline: SparklinePoint[];
  costSparkline: SparklinePoint[];
  jobsSparkline: SparklinePoint[];
}

export async function getDashboardChartsAction(): Promise<DashboardCharts> {
  await requireAuth();
  try {
    const { getDashboardSparklines } = await import('../db/usage.js');
    const { getJobsByDay } = await import('../db/jobs.js');
    const sparklines = getDashboardSparklines();
    const jobsByDay = getJobsByDay(7);
    return {
      tokenSparkline: sparklines.tokens,
      costSparkline: sparklines.cost,
      jobsSparkline: jobsByDay.map((r: { day: string; count: number | string }) => ({ day: r.day, value: Number(r.count) })),
    };
  } catch (err) {
    console.error('Failed to get dashboard charts:', err);
    return { tokenSparkline: [], costSparkline: [], jobsSparkline: [] };
  }
}

// ---------------------------------------------------------------------------
// Debug actions
// ---------------------------------------------------------------------------

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
    return { success: false, latencyMs: 0, model: '', error: (err as Error).message };
  }
}

export async function resetAgentCacheAction() {
  await requireAuth();
  try {
    const { resetAgentCache } = await import('../debug/index.js');
    return resetAgentCache();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function clearCheckpointsAction() {
  await requireAuth();
  try {
    const { clearCheckpoints } = await import('../debug/index.js');
    return clearCheckpoints();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Security actions
// ---------------------------------------------------------------------------

export async function getSecurityPolicies() {
  await requireAuth();
  try {
    const { getAllPolicies } = await import('../security/policies.js');
    return getAllPolicies();
  } catch (err) {
    console.error('Failed to get security policies:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

export async function updateToolPolicy(agent: string, tool: string, policy: ToolPolicyDecision): Promise<SuccessResult & { message?: string }> {
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
    return { success: false, message: (err as Error).message };
  }
}

export async function getPendingApprovals() {
  await requireAuth();
  try {
    const { getPendingApprovals: fetchPending } = await import('../security/approval.js');
    return fetchPending();
  } catch (err) {
    console.error('Failed to get pending approvals:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

export async function respondToApproval(id: string, approved: boolean): Promise<SuccessResult> {
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

export async function getToolNames(): Promise<string[]> {
  await requireAuth();
  try {
    const { toolRegistry } = await import('../ai/tools.js');
    return Object.keys(toolRegistry);
  } catch (err) {
    console.error('Failed to get tool names:', err);
    return [];
  }
}

interface AuditLogFilters {
  agentName?: string;
  toolName?: string;
  decision?: string;
}

export async function getAuditLogsAction(page: number = 1, filters: AuditLogFilters = {}) {
  await requireAuth();
  try {
    const { getAuditLogs, getAuditStats } = await import('../db/audit.js');
    const logs = getAuditLogs({ page, limit: 50, ...filters });
    const stats = getAuditStats();
    return { logs, stats };
  } catch (err) {
    console.error('Failed to get audit logs:', err);
    return { logs: [] as Array<Record<string, unknown>>, stats: [] as Array<Record<string, unknown>> };
  }
}

export async function generatePairingCodeAction(channelId: string) {
  await requireAuth();
  try {
    const { generatePairingCode } = await import('../security/pairing.js');
    return generatePairingCode(channelId);
  } catch (err) {
    console.error('Failed to generate pairing code:', err);
    return { error: 'Failed to generate pairing code' };
  }
}

export async function updateChannelAllowlistAction(channelId: string, senderIds: string[]): Promise<SuccessResult & { message?: string }> {
  await requireAuth();
  try {
    const fs = await import('fs');
    const { channelsFile } = await import('../paths.js');

    if (!fs.existsSync(channelsFile)) {
      return { success: false, message: 'CHANNELS.json not found' };
    }

    const channels = JSON.parse(fs.readFileSync(channelsFile, 'utf8'));
    const channel = channels.find((c: { id: string }) => c.id === channelId);
    if (!channel) {
      return { success: false, message: `Channel ${channelId} not found` };
    }

    if (!channel.policies) channel.policies = {};
    channel.policies.allowFrom = senderIds;

    fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2) + '\n', 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Failed to update channel allowlist:', err);
    return { success: false, message: (err as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Session monitoring actions
// ---------------------------------------------------------------------------

export async function getActiveSessions() {
  await requireAuth();
  try {
    const { getDb } = await import('../db/index.js');
    const { chats } = await import('../db/schema.js');
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
        messageCount: sql<number>`(SELECT COUNT(*) FROM messages WHERE messages.chat_id = ${chats.id})`,
      })
      .from(chats)
      .where(gte(chats.updatedAt, thirtyMinAgo))
      .orderBy(desc(chats.updatedAt))
      .all();

    return rows;
  } catch (err) {
    console.error('Failed to get active sessions:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

export async function getSwarmConfig(): Promise<{ crons: CronJobConfig[]; triggers: TriggerConfig[] }> {
  await requireAuth();
  const { cronsFile, triggersFile } = await import('../paths.js');
  const fs = await import('fs');
  let crons: CronJobConfig[] = [];
  let triggers: TriggerConfig[] = [];
  try { crons = JSON.parse(fs.readFileSync(cronsFile, 'utf8')); } catch {}
  try { triggers = JSON.parse(fs.readFileSync(triggersFile, 'utf8')); } catch {}
  return { crons, triggers };
}

// ---------------------------------------------------------------------------
// Cron run history actions
// ---------------------------------------------------------------------------

export async function getCronRunsAction(cronName: string, limit: number = 10) {
  await requireAuth();
  try {
    const { getRecentCronRuns } = await import('../db/cron-runs.js');
    return getRecentCronRuns(cronName, limit);
  } catch (err) {
    return [] as Array<Record<string, unknown>>;
  }
}

export async function getCronRunStatsAction() {
  await requireAuth();
  try {
    const { getCronRunStats } = await import('../db/cron-runs.js');
    return getCronRunStats();
  } catch (err) {
    return [] as Array<Record<string, unknown>>;
  }
}

// ---------------------------------------------------------------------------
// Cron CRUD actions
// ---------------------------------------------------------------------------

interface CronData {
  name?: string;
  schedule?: string;
  type?: 'agent' | 'command' | 'webhook';
  enabled?: boolean;
  job?: string;
  command?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  vars?: Record<string, unknown>;
}

interface CronMutationResult {
  success: boolean;
  message?: string;
  enabled?: boolean;
}

async function readCronsFile(): Promise<CronJobConfig[]> {
  const fs = await import('fs');
  const { cronsFile } = await import('../paths.js');
  try {
    return JSON.parse(fs.readFileSync(cronsFile, 'utf8'));
  } catch {
    return [];
  }
}

async function writeCronsFile(crons: CronJobConfig[]): Promise<void> {
  const fs = await import('fs');
  const { cronsFile } = await import('../paths.js');
  fs.writeFileSync(cronsFile, JSON.stringify(crons, null, 2) + '\n', 'utf8');
  try {
    const { reloadCrons } = await import('../cron.js');
    reloadCrons();
  } catch {}
}

export async function getCronsList(): Promise<CronJobConfig[]> {
  await requireAuth();
  return readCronsFile();
}

export async function createCron(data: CronData): Promise<CronMutationResult> {
  await requireAuth();
  const { validateSchedule } = await import('../cron.js');
  if (!data.name || !data.schedule) return { success: false, message: 'Name and schedule are required' };
  if (!validateSchedule(data.schedule)) return { success: false, message: 'Invalid cron schedule' };

  const crons = await readCronsFile();
  const entry: CronJobConfig = {
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

export async function updateCron(index: number, data: CronData): Promise<CronMutationResult> {
  await requireAuth();
  const { validateSchedule } = await import('../cron.js');
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: 'Invalid index' };
  if (data.schedule && !validateSchedule(data.schedule)) return { success: false, message: 'Invalid cron schedule' };

  crons[index] = { ...crons[index], ...data };
  await writeCronsFile(crons);
  return { success: true };
}

export async function deleteCron(index: number): Promise<CronMutationResult> {
  await requireAuth();
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: 'Invalid index' };
  crons.splice(index, 1);
  await writeCronsFile(crons);
  return { success: true };
}

export async function toggleCronEnabled(index: number): Promise<CronMutationResult> {
  await requireAuth();
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: 'Invalid index' };
  crons[index].enabled = crons[index].enabled === false ? true : false;
  await writeCronsFile(crons);
  return { success: true, enabled: crons[index].enabled };
}

// ---------------------------------------------------------------------------
// Jobs actions
// ---------------------------------------------------------------------------

interface CancelJobResult {
  success: boolean;
  message?: string;
}

interface RetryJobResult {
  success: boolean;
  newJobId?: string;
  message?: string;
}

/**
 * Get paginated job list from DB.
 */
export async function getJobs(page: number = 1, status?: string) {
  await requireAuth();
  try {
    const { getRecentJobs } = await import('../db/jobs.js');
    const limit = 20;
    const offset = (page - 1) * limit;
    return getRecentJobs({ limit, offset, status });
  } catch (err) {
    console.error('Failed to get jobs:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

/**
 * Get a single job by ID.
 */
export async function getJob(jobId: string) {
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
 */
export async function getJobDashboardCounts() {
  await requireAuth();
  try {
    const { getJobCounts } = await import('../db/jobs.js');
    return getJobCounts();
  } catch (err) {
    console.error('Failed to get job counts:', err);
    return { created: 0, queued: 0, completed: 0, failed: 0 } as Record<string, number>;
  }
}

/**
 * Cancel a running job.
 */
export async function cancelJobAction(jobId: string): Promise<CancelJobResult> {
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
    return { success: false, message: (err as Error).message };
  }
}

/**
 * Retry a job by creating a new one with the same prompt.
 */
export async function retryJobAction(jobId: string): Promise<RetryJobResult> {
  await requireAuth();
  try {
    const { getJobById } = await import('../db/jobs.js');
    const job = getJobById(jobId);
    if (!job) return { success: false, message: 'Job not found' };

    const { createJob } = await import('../tools/create-job.js');
    const result = await createJob(job.prompt, { source: job.source, chatId: job.chatId ?? undefined });
    return { success: true, newJobId: result.job_id };
  } catch (err) {
    console.error('Failed to retry job:', err);
    return { success: false, message: (err as Error).message };
  }
}

/**
 * Get warm pool status.
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

// ---------------------------------------------------------------------------
// Memory actions
// ---------------------------------------------------------------------------

interface MemoryFields {
  content?: string;
  category?: string;
  relevance?: number;
}

/**
 * Get memories, optionally filtered by category.
 */
export async function getMemoriesAction(category?: string) {
  await requireAuth();
  try {
    const { getMemories } = await import('../db/memories.js');
    return getMemories({ category });
  } catch (err) {
    console.error('Failed to get memories:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

/**
 * Search memories by query.
 */
export async function searchMemoriesAction(query: string, category?: string) {
  await requireAuth();
  try {
    const { searchMemories } = await import('../db/memories.js');
    return searchMemories(query, { category });
  } catch (err) {
    console.error('Failed to search memories:', err);
    return [] as Array<Record<string, unknown>>;
  }
}

/**
 * Manually create a memory.
 */
export async function createMemoryAction(content: string, category: string = 'general') {
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
 */
export async function deleteMemoryAction(id: string): Promise<SuccessResult> {
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
 */
export async function updateMemoryAction(id: string, fields: MemoryFields): Promise<SuccessResult> {
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
