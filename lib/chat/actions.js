"use server";
import { auth } from "../auth/index.js";
import {
  createChat as dbCreateChat,
  getChatById,
  getMessagesByChatId,
  deleteChat as dbDeleteChat,
  deleteAllChatsByUser,
  updateChatTitle,
  toggleChatStarred
} from "../db/chats.js";
import {
  getNotifications as dbGetNotifications,
  getUnreadCount as dbGetUnreadCount,
  markAllRead as dbMarkAllRead
} from "../db/notifications.js";
async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}
async function getChats() {
  const user = await requireAuth();
  const { or, eq, desc } = await import("drizzle-orm");
  const { getDb } = await import("../db/index.js");
  const { chats } = await import("../db/schema.js");
  const db = getDb();
  return db.select().from(chats).where(or(eq(chats.userId, user.id), eq(chats.userId, "telegram"))).orderBy(desc(chats.updatedAt)).all();
}
async function getChatMessages(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id && chat.userId !== "telegram") {
    return [];
  }
  return getMessagesByChatId(chatId);
}
async function createChat(id, title = "New Chat") {
  const user = await requireAuth();
  return dbCreateChat(user.id, title, id ?? null);
}
async function deleteChat(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  dbDeleteChat(chatId);
  return { success: true };
}
async function renameChat(chatId, title) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  updateChatTitle(chatId, title);
  return { success: true };
}
async function starChat(chatId) {
  const user = await requireAuth();
  const chat = getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return { success: false };
  }
  const starred = toggleChatStarred(chatId);
  return { success: true, starred };
}
async function deleteAllChats() {
  const user = await requireAuth();
  deleteAllChatsByUser(user.id);
  return { success: true };
}
async function getNotifications() {
  await requireAuth();
  return dbGetNotifications();
}
async function getUnreadNotificationCount() {
  await requireAuth();
  return dbGetUnreadCount();
}
async function markNotificationsRead() {
  await requireAuth();
  dbMarkAllRead();
  return { success: true };
}
async function getHealthStatusAction() {
  await requireAuth();
  try {
    const { getHealthStatus } = await import("../health/index.js");
    return getHealthStatus();
  } catch (err) {
    return { overall: "unknown", components: {} };
  }
}
async function getGatewayStatusAction() {
  await requireAuth();
  try {
    const { getGateway } = await import("../gateway/index.js");
    const gw = getGateway();
    if (!gw) return { running: false, connections: 0, sessions: [] };
    return {
      running: true,
      connections: gw.connectionCount,
      sessions: gw.getSessions()
    };
  } catch (err) {
    return { running: false, connections: 0, sessions: [] };
  }
}
async function getAppVersion() {
  await requireAuth();
  const { getInstalledVersion } = await import("../cron.js");
  const { getAvailableVersion } = await import("../db/update-check.js");
  return { version: getInstalledVersion(), updateAvailable: getAvailableVersion() };
}
async function triggerUpgrade() {
  await requireAuth();
  const { triggerWorkflowDispatch } = await import("../tools/github.js");
  await triggerWorkflowDispatch("upgrade-event-handler.yml");
  return { success: true };
}
async function createNewApiKey() {
  const user = await requireAuth();
  try {
    const { createApiKeyRecord } = await import("../db/api-keys.js");
    return createApiKeyRecord(user.id);
  } catch (err) {
    console.error("Failed to create API key:", err);
    return { error: "Failed to create API key" };
  }
}
async function getApiKeys() {
  await requireAuth();
  try {
    const { getApiKey } = await import("../db/api-keys.js");
    return getApiKey();
  } catch (err) {
    console.error("Failed to get API key:", err);
    return null;
  }
}
async function deleteApiKey() {
  await requireAuth();
  try {
    const mod = await import("../db/api-keys.js");
    mod.deleteApiKey();
    return { success: true };
  } catch (err) {
    console.error("Failed to delete API key:", err);
    return { error: "Failed to delete API key" };
  }
}
async function getSwarmStatus(page = 1) {
  await requireAuth();
  try {
    const { getSwarmStatus: fetchStatus } = await import("../tools/github.js");
    const result = await fetchStatus(page);
    try {
      const { getJobById } = await import("../db/jobs.js");
      if (result.runs) {
        for (const run of result.runs) {
          if (run.job_id) {
            const dbJob = getJobById(run.job_id);
            if (dbJob) {
              run.prompt = dbJob.prompt;
              run.summary = dbJob.summary ?? void 0;
              run.dbStatus = dbJob.status;
              run.source = dbJob.source;
            }
          }
        }
      }
    } catch {
    }
    return result;
  } catch (err) {
    console.error("Failed to get swarm status:", err);
    return { error: "Failed to get swarm status", runs: [], hasMore: false };
  }
}
async function getSkillsList() {
  await requireAuth();
  try {
    const { listSkills } = await import("../skills/index.js");
    return listSkills();
  } catch (err) {
    console.error("Failed to list skills:", err);
    return [];
  }
}
async function searchSkillsAction(query) {
  await requireAuth();
  try {
    const { searchRegistry } = await import("../skills/index.js");
    return await searchRegistry(query);
  } catch (err) {
    console.error("Failed to search skills:", err);
    return [];
  }
}
async function installSkillAction(name) {
  await requireAuth();
  try {
    const { installSkill } = await import("../skills/index.js");
    return await installSkill(name);
  } catch (err) {
    console.error("Failed to install skill:", err);
    return { success: false, message: err.message };
  }
}
async function toggleSkillAction(name, enabled) {
  await requireAuth();
  try {
    const { toggleSkill } = await import("../skills/index.js");
    return toggleSkill(name, enabled);
  } catch (err) {
    console.error("Failed to toggle skill:", err);
    return { success: false, message: err.message };
  }
}
async function removeSkillAction(name) {
  await requireAuth();
  try {
    const { removeSkill } = await import("../skills/index.js");
    return removeSkill(name);
  } catch (err) {
    console.error("Failed to remove skill:", err);
    return { success: false, message: err.message };
  }
}
async function checkSkillUpdatesAction() {
  await requireAuth();
  try {
    const { checkUpdates } = await import("../skills/index.js");
    return await checkUpdates();
  } catch (err) {
    console.error("Failed to check skill updates:", err);
    return [];
  }
}
async function getChannelsList() {
  await requireAuth();
  try {
    const { getChannelRegistry } = await import("../channels/registry.js");
    const registry = getChannelRegistry();
    return registry.getAll();
  } catch (err) {
    console.error("Failed to list channels:", err);
    try {
      const fs = await import("fs");
      const { channelsFile } = await import("../paths.js");
      if (fs.existsSync(channelsFile)) {
        const channels = JSON.parse(
          fs.readFileSync(channelsFile, "utf8")
        );
        return channels.map((c) => ({
          id: c.id,
          type: c.type,
          enabled: c.enabled,
          webhook_path: c.webhook_path
        }));
      }
    } catch {
    }
    return [];
  }
}
async function getChannelMetricsAction() {
  await requireAuth();
  try {
    const { getChannelMetrics } = await import("../channels/metrics.js");
    return getChannelMetrics();
  } catch (err) {
    return {};
  }
}
async function getAgentsList() {
  await requireAuth();
  try {
    const { loadAgentConfigs } = await import("../ai/sub-agents.js");
    const configs = loadAgentConfigs();
    return configs.map((c) => ({
      name: c._name || c.name,
      displayName: c.displayName || null,
      avatar: c.avatar || null,
      description: c.description || "",
      tools: c.tools || [],
      model: c.model || null,
      enabled: c.enabled !== false
    }));
  } catch (err) {
    console.error("Failed to list agents:", err);
    return [];
  }
}
async function getModelsCatalog() {
  await requireAuth();
  try {
    const { loadModelsCatalog } = await import("../ai/models-catalog.js");
    return loadModelsCatalog();
  } catch (err) {
    console.error("Failed to load models catalog:", err);
    return null;
  }
}
async function getDashboardData() {
  await requireAuth();
  try {
    const fs = await import("fs");
    const { mantisDb, cronsFile, agentsDir } = await import("../paths.js");
    const uptimeMs = process.uptime() * 1e3;
    let dbSizeBytes = 0;
    try {
      dbSizeBytes = fs.statSync(mantisDb).size;
    } catch {
    }
    let activeChannels = 0;
    try {
      const { getChannelRegistry } = await import("../channels/registry.js");
      activeChannels = getChannelRegistry().getAll().filter((c) => c.enabled).length;
    } catch {
    }
    let activeCrons = 0;
    try {
      if (fs.existsSync(cronsFile)) {
        const crons = JSON.parse(fs.readFileSync(cronsFile, "utf8"));
        activeCrons = crons.filter((c) => c.enabled !== false).length;
      }
    } catch {
    }
    let totalAgents = 0;
    try {
      if (fs.existsSync(agentsDir)) {
        totalAgents = fs.readdirSync(agentsDir).filter(
          (d) => fs.statSync(`${agentsDir}/${d}`).isDirectory()
        ).length;
      }
    } catch {
    }
    let recentNotifications = [];
    try {
      const { getNotifications: getNotifications2 } = await import("../db/notifications.js");
      recentNotifications = getNotifications2().slice(0, 5);
    } catch {
    }
    let jobCounts = { created: 0, queued: 0, completed: 0, failed: 0 };
    try {
      const { getJobCounts } = await import("../db/jobs.js");
      jobCounts = getJobCounts();
    } catch {
    }
    let warmPool = null;
    try {
      const { getWarmPool } = await import("../execution/warm-pool.js");
      const pool = getWarmPool();
      if (pool) warmPool = pool.getStatus();
    } catch {
    }
    return {
      uptimeMs,
      dbSizeBytes,
      activeChannels,
      activeCrons,
      totalAgents,
      nodeVersion: process.version,
      recentNotifications,
      jobCounts,
      warmPool
    };
  } catch (err) {
    console.error("Failed to get dashboard data:", err);
    return null;
  }
}
async function getLogsAction(filters = {}) {
  await requireAuth();
  try {
    const { getLogBuffer } = await import("../logs/buffer.js");
    return getLogBuffer().getAll(filters);
  } catch (err) {
    return [];
  }
}
async function clearLogsAction() {
  await requireAuth();
  try {
    const { getLogBuffer } = await import("../logs/buffer.js");
    getLogBuffer().clear();
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}
async function getUsageStatsAction(period = "7d") {
  await requireAuth();
  try {
    const { getUsageStats } = await import("../db/usage.js");
    return getUsageStats(period);
  } catch (err) {
    console.error("Failed to get usage stats:", err);
    return { totalRequests: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, totalCostUsd: 0, avgDurationMs: 0 };
  }
}
async function getUsageByModelAction(period = "7d") {
  await requireAuth();
  try {
    const { getUsageByModel } = await import("../db/usage.js");
    return getUsageByModel(period);
  } catch (err) {
    console.error("Failed to get usage by model:", err);
    return [];
  }
}
async function getUsageByDayAction(days = 7) {
  await requireAuth();
  try {
    const { getUsageByDay } = await import("../db/usage.js");
    return getUsageByDay(days);
  } catch (err) {
    console.error("Failed to get usage by day:", err);
    return [];
  }
}
async function getUsageBySourceAction(period = "7d") {
  await requireAuth();
  try {
    const { getUsageBySource } = await import("../db/usage.js");
    return getUsageBySource(period);
  } catch (err) {
    console.error("Failed to get usage by source:", err);
    return [];
  }
}
async function getTokenBreakdownByDayAction(days = 7) {
  await requireAuth();
  try {
    const { getTokenBreakdownByDay } = await import("../db/usage.js");
    return getTokenBreakdownByDay(days);
  } catch (err) {
    console.error("Failed to get token breakdown:", err);
    return [];
  }
}
async function getDashboardChartsAction() {
  await requireAuth();
  try {
    const { getDashboardSparklines } = await import("../db/usage.js");
    const { getJobsByDay } = await import("../db/jobs.js");
    const sparklines = getDashboardSparklines();
    const jobsByDay = getJobsByDay(7);
    return {
      tokenSparkline: sparklines.tokens,
      costSparkline: sparklines.cost,
      jobsSparkline: jobsByDay.map((r) => ({ day: r.day, value: Number(r.count) }))
    };
  } catch (err) {
    console.error("Failed to get dashboard charts:", err);
    return { tokenSparkline: [], costSparkline: [], jobsSparkline: [] };
  }
}
async function getDebugInfoAction() {
  await requireAuth();
  try {
    const { getDebugInfo } = await import("../debug/index.js");
    return await getDebugInfo();
  } catch (err) {
    console.error("Failed to get debug info:", err);
    return null;
  }
}
async function testLlmConnectionAction() {
  await requireAuth();
  try {
    const { testLlmConnection } = await import("../debug/index.js");
    return await testLlmConnection();
  } catch (err) {
    return { success: false, latencyMs: 0, model: "", error: err.message };
  }
}
async function resetAgentCacheAction() {
  await requireAuth();
  try {
    const { resetAgentCache } = await import("../debug/index.js");
    return resetAgentCache();
  } catch (err) {
    return { success: false, error: err.message };
  }
}
async function clearCheckpointsAction() {
  await requireAuth();
  try {
    const { clearCheckpoints } = await import("../debug/index.js");
    return clearCheckpoints();
  } catch (err) {
    return { success: false, error: err.message };
  }
}
async function getSecurityPolicies() {
  await requireAuth();
  try {
    const { getAllPolicies } = await import("../security/policies.js");
    return getAllPolicies();
  } catch (err) {
    console.error("Failed to get security policies:", err);
    return [];
  }
}
async function updateToolPolicy(agent, tool, policy) {
  await requireAuth();
  try {
    const { setToolPolicy } = await import("../security/policies.js");
    setToolPolicy(agent, tool, policy);
    const { resetAgent } = await import("../ai/agent.js");
    resetAgent();
    return { success: true };
  } catch (err) {
    console.error("Failed to update tool policy:", err);
    return { success: false, message: err.message };
  }
}
async function getPendingApprovals() {
  await requireAuth();
  try {
    const { getPendingApprovals: fetchPending } = await import("../security/approval.js");
    return fetchPending();
  } catch (err) {
    console.error("Failed to get pending approvals:", err);
    return [];
  }
}
async function respondToApproval(id, approved) {
  await requireAuth();
  try {
    if (approved) {
      const { approveRequest } = await import("../security/approval.js");
      approveRequest(id);
    } else {
      const { denyRequest } = await import("../security/approval.js");
      denyRequest(id);
    }
    return { success: true };
  } catch (err) {
    console.error("Failed to respond to approval:", err);
    return { success: false };
  }
}
async function getToolNames() {
  await requireAuth();
  try {
    const { toolRegistry } = await import("../ai/tools.js");
    return Object.keys(toolRegistry);
  } catch (err) {
    console.error("Failed to get tool names:", err);
    return [];
  }
}
async function getAuditLogsAction(page = 1, filters = {}) {
  await requireAuth();
  try {
    const { getAuditLogs, getAuditStats } = await import("../db/audit.js");
    const logs = getAuditLogs({ page, limit: 50, ...filters });
    const stats = getAuditStats();
    return { logs, stats };
  } catch (err) {
    console.error("Failed to get audit logs:", err);
    return { logs: [], stats: [] };
  }
}
async function generatePairingCodeAction(channelId) {
  await requireAuth();
  try {
    const { generatePairingCode } = await import("../security/pairing.js");
    return generatePairingCode(channelId);
  } catch (err) {
    console.error("Failed to generate pairing code:", err);
    return { error: "Failed to generate pairing code" };
  }
}
async function updateChannelAllowlistAction(channelId, senderIds) {
  await requireAuth();
  try {
    const fs = await import("fs");
    const { channelsFile } = await import("../paths.js");
    if (!fs.existsSync(channelsFile)) {
      return { success: false, message: "CHANNELS.json not found" };
    }
    const channels = JSON.parse(fs.readFileSync(channelsFile, "utf8"));
    const channel = channels.find((c) => c.id === channelId);
    if (!channel) {
      return { success: false, message: `Channel ${channelId} not found` };
    }
    if (!channel.policies) channel.policies = {};
    channel.policies.allowFrom = senderIds;
    fs.writeFileSync(channelsFile, JSON.stringify(channels, null, 2) + "\n", "utf8");
    return { success: true };
  } catch (err) {
    console.error("Failed to update channel allowlist:", err);
    return { success: false, message: err.message };
  }
}
async function getActiveSessions() {
  await requireAuth();
  try {
    const { getDb } = await import("../db/index.js");
    const { chats } = await import("../db/schema.js");
    const { gte, sql, desc } = await import("drizzle-orm");
    const db = getDb();
    const thirtyMinAgo = Date.now() - 30 * 60 * 1e3;
    const rows = db.select({
      id: chats.id,
      title: chats.title,
      userId: chats.userId,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
      messageCount: sql`(SELECT COUNT(*) FROM messages WHERE messages.chat_id = ${chats.id})`
    }).from(chats).where(gte(chats.updatedAt, thirtyMinAgo)).orderBy(desc(chats.updatedAt)).all();
    return rows;
  } catch (err) {
    console.error("Failed to get active sessions:", err);
    return [];
  }
}
async function getSwarmConfig() {
  await requireAuth();
  const { cronsFile, triggersFile } = await import("../paths.js");
  const fs = await import("fs");
  let crons = [];
  let triggers = [];
  try {
    crons = JSON.parse(fs.readFileSync(cronsFile, "utf8"));
  } catch {
  }
  try {
    triggers = JSON.parse(fs.readFileSync(triggersFile, "utf8"));
  } catch {
  }
  return { crons, triggers };
}
async function getCronRunsAction(cronName, limit = 10) {
  await requireAuth();
  try {
    const { getRecentCronRuns } = await import("../db/cron-runs.js");
    return getRecentCronRuns(cronName, limit);
  } catch (err) {
    return [];
  }
}
async function getCronRunStatsAction() {
  await requireAuth();
  try {
    const { getCronRunStats } = await import("../db/cron-runs.js");
    return getCronRunStats();
  } catch (err) {
    return [];
  }
}
async function readCronsFile() {
  const fs = await import("fs");
  const { cronsFile } = await import("../paths.js");
  try {
    return JSON.parse(fs.readFileSync(cronsFile, "utf8"));
  } catch {
    return [];
  }
}
async function writeCronsFile(crons) {
  const fs = await import("fs");
  const { cronsFile } = await import("../paths.js");
  fs.writeFileSync(cronsFile, JSON.stringify(crons, null, 2) + "\n", "utf8");
  try {
    const { reloadCrons } = await import("../cron.js");
    reloadCrons();
  } catch {
  }
}
async function getCronsList() {
  await requireAuth();
  return readCronsFile();
}
async function createCron(data) {
  await requireAuth();
  const { validateSchedule } = await import("../cron.js");
  if (!data.name || !data.schedule) return { success: false, message: "Name and schedule are required" };
  if (!validateSchedule(data.schedule)) return { success: false, message: "Invalid cron schedule" };
  const crons = await readCronsFile();
  const entry = {
    name: data.name,
    schedule: data.schedule,
    type: data.type || "agent",
    enabled: data.enabled !== false
  };
  if (entry.type === "agent") entry.job = data.job || "";
  if (entry.type === "command") entry.command = data.command || "";
  if (entry.type === "webhook") {
    entry.url = data.url || "";
    if (data.method) entry.method = data.method;
    if (data.headers) entry.headers = data.headers;
    if (data.vars) entry.vars = data.vars;
  }
  crons.push(entry);
  await writeCronsFile(crons);
  return { success: true };
}
async function updateCron(index, data) {
  await requireAuth();
  const { validateSchedule } = await import("../cron.js");
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: "Invalid index" };
  if (data.schedule && !validateSchedule(data.schedule)) return { success: false, message: "Invalid cron schedule" };
  crons[index] = { ...crons[index], ...data };
  await writeCronsFile(crons);
  return { success: true };
}
async function deleteCron(index) {
  await requireAuth();
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: "Invalid index" };
  crons.splice(index, 1);
  await writeCronsFile(crons);
  return { success: true };
}
async function toggleCronEnabled(index) {
  await requireAuth();
  const crons = await readCronsFile();
  if (index < 0 || index >= crons.length) return { success: false, message: "Invalid index" };
  crons[index].enabled = crons[index].enabled === false ? true : false;
  await writeCronsFile(crons);
  return { success: true, enabled: crons[index].enabled };
}
async function getJobs(page = 1, status) {
  await requireAuth();
  try {
    const { getRecentJobs } = await import("../db/jobs.js");
    const limit = 20;
    const offset = (page - 1) * limit;
    return getRecentJobs({ limit, offset, status });
  } catch (err) {
    console.error("Failed to get jobs:", err);
    return [];
  }
}
async function getJob(jobId) {
  await requireAuth();
  try {
    const { getJobById } = await import("../db/jobs.js");
    return getJobById(jobId) || null;
  } catch (err) {
    console.error("Failed to get job:", err);
    return null;
  }
}
async function getJobDashboardCounts() {
  await requireAuth();
  try {
    const { getJobCounts } = await import("../db/jobs.js");
    return getJobCounts();
  } catch (err) {
    console.error("Failed to get job counts:", err);
    return { created: 0, queued: 0, completed: 0, failed: 0 };
  }
}
async function cancelJobAction(jobId) {
  await requireAuth();
  try {
    const { getJobById, updateJob } = await import("../db/jobs.js");
    const job = getJobById(jobId);
    if (!job) return { success: false, message: "Job not found" };
    if (job.status !== "created" && job.status !== "queued") {
      return { success: false, message: `Job is ${job.status}, not cancellable` };
    }
    if (job.runnerType === "warm") {
      try {
        const { getWarmPool } = await import("../execution/warm-pool.js");
        const pool = getWarmPool();
        if (pool) pool.cancelJob(jobId);
      } catch {
      }
    } else if (job.runnerType === "local") {
      const { cancelLocalJob } = await import("../execution/local-runner.js");
      cancelLocalJob(jobId);
    } else if (job.branch) {
      const { findWorkflowRunForBranch, cancelWorkflowRun } = await import("../tools/github.js");
      const runId = await findWorkflowRunForBranch(job.branch);
      if (runId) await cancelWorkflowRun(runId);
    }
    const current = getJobById(jobId);
    if (current && (current.status === "created" || current.status === "queued")) {
      updateJob(jobId, { status: "failed", completedAt: Date.now(), error: "Cancelled by user" });
    }
    return { success: true };
  } catch (err) {
    console.error("Failed to cancel job:", err);
    return { success: false, message: err.message };
  }
}
async function retryJobAction(jobId) {
  await requireAuth();
  try {
    const { getJobById } = await import("../db/jobs.js");
    const job = getJobById(jobId);
    if (!job) return { success: false, message: "Job not found" };
    const { createJob } = await import("../tools/create-job.js");
    const result = await createJob(job.prompt, { source: job.source, chatId: job.chatId ?? void 0 });
    return { success: true, newJobId: result.job_id };
  } catch (err) {
    console.error("Failed to retry job:", err);
    return { success: false, message: err.message };
  }
}
async function getWarmPoolStatus() {
  await requireAuth();
  try {
    const { getWarmPool } = await import("../execution/warm-pool.js");
    const pool = getWarmPool();
    return pool ? pool.getStatus() : null;
  } catch {
    return null;
  }
}
async function getMemoriesAction(category) {
  await requireAuth();
  try {
    const { getMemories } = await import("../db/memories.js");
    return getMemories({ category });
  } catch (err) {
    console.error("Failed to get memories:", err);
    return [];
  }
}
async function searchMemoriesAction(query, category) {
  await requireAuth();
  try {
    const { searchMemories } = await import("../db/memories.js");
    return searchMemories(query, { category });
  } catch (err) {
    console.error("Failed to search memories:", err);
    return [];
  }
}
async function createMemoryAction(content, category = "general") {
  await requireAuth();
  try {
    const { createMemory } = await import("../db/memories.js");
    return createMemory({ content, category });
  } catch (err) {
    console.error("Failed to create memory:", err);
    return { error: "Failed to create memory" };
  }
}
async function deleteMemoryAction(id) {
  await requireAuth();
  try {
    const { deleteMemory } = await import("../db/memories.js");
    deleteMemory(id);
    return { success: true };
  } catch (err) {
    console.error("Failed to delete memory:", err);
    return { success: false };
  }
}
async function updateMemoryAction(id, fields) {
  await requireAuth();
  try {
    const { updateMemory } = await import("../db/memories.js");
    updateMemory(id, fields);
    return { success: true };
  } catch (err) {
    console.error("Failed to update memory:", err);
    return { success: false };
  }
}
export {
  cancelJobAction,
  checkSkillUpdatesAction,
  clearCheckpointsAction,
  clearLogsAction,
  createChat,
  createCron,
  createMemoryAction,
  createNewApiKey,
  deleteAllChats,
  deleteApiKey,
  deleteChat,
  deleteCron,
  deleteMemoryAction,
  generatePairingCodeAction,
  getActiveSessions,
  getAgentsList,
  getApiKeys,
  getAppVersion,
  getAuditLogsAction,
  getChannelMetricsAction,
  getChannelsList,
  getChatMessages,
  getChats,
  getCronRunStatsAction,
  getCronRunsAction,
  getCronsList,
  getDashboardChartsAction,
  getDashboardData,
  getDebugInfoAction,
  getGatewayStatusAction,
  getHealthStatusAction,
  getJob,
  getJobDashboardCounts,
  getJobs,
  getLogsAction,
  getMemoriesAction,
  getModelsCatalog,
  getNotifications,
  getPendingApprovals,
  getSecurityPolicies,
  getSkillsList,
  getSwarmConfig,
  getSwarmStatus,
  getTokenBreakdownByDayAction,
  getToolNames,
  getUnreadNotificationCount,
  getUsageByDayAction,
  getUsageByModelAction,
  getUsageBySourceAction,
  getUsageStatsAction,
  getWarmPoolStatus,
  installSkillAction,
  markNotificationsRead,
  removeSkillAction,
  renameChat,
  resetAgentCacheAction,
  respondToApproval,
  retryJobAction,
  searchMemoriesAction,
  searchSkillsAction,
  starChat,
  testLlmConnectionAction,
  toggleCronEnabled,
  toggleSkillAction,
  triggerUpgrade,
  updateChannelAllowlistAction,
  updateCron,
  updateMemoryAction,
  updateToolPolicy
};
