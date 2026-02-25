import { timingSafeEqual } from "crypto";
import { createJob } from "../lib/tools/create-job.js";
import { setWebhook } from "../lib/tools/telegram.js";
import { getJobStatus } from "../lib/tools/github.js";
import { getTelegramAdapter } from "../lib/channels/index.js";
import { getChannelRegistry } from "../lib/channels/registry.js";
import { chat, chatWithAgent, summarizeJob } from "../lib/ai/index.js";
import { createNotification } from "../lib/db/notifications.js";
import { loadTriggers } from "../lib/triggers.js";
import { verifyApiKey } from "../lib/db/api-keys.js";
import { sanitizeInput } from "../lib/security/sanitize.js";
let telegramBotToken = null;
let _fireTriggers = null;
function getTelegramBotToken() {
  if (!telegramBotToken) {
    telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || null;
  }
  return telegramBotToken;
}
function getFireTriggers() {
  if (!_fireTriggers) {
    const result = loadTriggers();
    _fireTriggers = result.fireTriggers;
  }
  return _fireTriggers;
}
const STATIC_PUBLIC_ROUTES = ["/telegram/webhook", "/github/webhook", "/ping"];
function getPublicRoutes() {
  const registry = getChannelRegistry();
  const channelPaths = registry.getWebhookPaths();
  return [.../* @__PURE__ */ new Set([...STATIC_PUBLIC_ROUTES, ...channelPaths])];
}
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
function checkAuth(routePath, request) {
  if (getPublicRoutes().includes(routePath)) return null;
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const record = verifyApiKey(apiKey);
  if (!record) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
function extractJobId(branchName) {
  if (!branchName || !branchName.startsWith("job/")) return null;
  return branchName.slice(4);
}
async function handleWebhook(request) {
  const body = await request.json();
  const { job } = body;
  if (!job) return Response.json({ error: "Missing job field" }, { status: 400 });
  try {
    const result = await createJob(job, { source: "api" });
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed to create job" }, { status: 500 });
  }
}
async function handleTelegramRegister(request) {
  const body = await request.json();
  const { bot_token, webhook_url } = body;
  if (!bot_token || !webhook_url) {
    return Response.json({ error: "Missing bot_token or webhook_url" }, { status: 400 });
  }
  try {
    const result = await setWebhook(bot_token, webhook_url, process.env.TELEGRAM_WEBHOOK_SECRET);
    telegramBotToken = bot_token;
    return Response.json({ success: true, result });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Failed to register webhook" }, { status: 500 });
  }
}
async function handleTelegramWebhook(request) {
  const botToken = getTelegramBotToken();
  if (!botToken) return Response.json({ ok: true });
  const adapter = getTelegramAdapter(botToken);
  const normalized = await adapter.receive(request);
  if (!normalized) return Response.json({ ok: true });
  processChannelMessage(adapter, normalized, "telegram").catch((err) => {
    console.error("Failed to process message:", err);
  });
  return Response.json({ ok: true });
}
async function handleChannelWebhook(request, routePath) {
  const registry = getChannelRegistry();
  const match = registry.getByRoute(routePath);
  if (!match) return Response.json({ error: "Not found" }, { status: 404 });
  const { id, adapter } = match;
  const normalized = await adapter.receive(request);
  if (!normalized) return Response.json({ ok: true });
  if (normalized._challenge !== void 0) {
    return new Response(normalized._challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }
  if (normalized._pong) {
    return Response.json({ type: 1 });
  }
  processChannelMessage(adapter, normalized, id, match.config).catch((err) => {
    console.error(`[${id}] Failed to process message:`, err);
  });
  return Response.json({ ok: true });
}
async function processChannelMessage(adapter, normalized, channelId, channelConfig) {
  try {
    const { recordChannelMessage } = await import("../lib/channels/metrics.js");
    recordChannelMessage(channelId, "inbound");
  } catch {
  }
  const sanitized = sanitizeInput(normalized.text);
  if (sanitized.sanitized) {
    console.warn(`[security] Sanitization flags in ${channelId}: ${sanitized.patternsFound.join(", ")}`);
  }
  await adapter.acknowledge(normalized.metadata);
  const stopIndicator = adapter.startProcessingIndicator(normalized.metadata);
  try {
    const agentName = channelConfig?.agent;
    const chatOptions = { userId: channelId, chatTitle: channelId };
    if (adapter.supportsChunkedDelivery && !agentName) {
      const { chatStream } = await import("../lib/ai/index.js");
      const { ChannelStreamQueue } = await import("../lib/channels/stream-queue.js");
      const streamConfig = channelConfig?.streaming;
      const queue = new ChannelStreamQueue(streamConfig?.updateIntervalMs || 1500);
      let fullText = "";
      let streamMessageId;
      const stream = chatStream(normalized.threadId, normalized.text, normalized.attachments, chatOptions);
      for await (const event of stream) {
        if (event.type === "text" && event.text) {
          fullText += event.text;
          queue.enqueue(normalized.threadId, fullText, async (text) => {
            try {
              const metadata = { ...normalized.metadata, _streamMessageId: streamMessageId ? Number(streamMessageId) : void 0 };
              const result = await adapter.sendStreamChunk(normalized.threadId, "", text, metadata);
              if (result && !streamMessageId) {
                streamMessageId = result;
              }
            } catch (err) {
              console.error(`[${channelId}] Stream chunk failed:`, err);
            }
          });
        }
      }
      await queue.flush();
      const finalMetadata = { ...normalized.metadata, _streamMessageId: streamMessageId ? Number(streamMessageId) : void 0 };
      await adapter.sendStreamEnd(normalized.threadId, fullText, finalMetadata);
    } else {
      const response = agentName ? await chatWithAgent(agentName, normalized.threadId, normalized.text, normalized.attachments, chatOptions) : await chat(normalized.threadId, normalized.text, normalized.attachments, chatOptions);
      await adapter.sendResponse(normalized.threadId, response, normalized.metadata);
    }
    try {
      const { recordChannelMessage } = await import("../lib/channels/metrics.js");
      recordChannelMessage(channelId, "outbound");
    } catch {
    }
  } catch (err) {
    console.error("Failed to process message with AI:", err);
    await adapter.sendResponse(
      normalized.threadId,
      "Sorry, I encountered an error processing your message.",
      normalized.metadata
    ).catch(() => {
    });
  } finally {
    stopIndicator();
  }
}
async function handleGithubWebhook(request) {
  const { GH_WEBHOOK_SECRET } = process.env;
  if (!GH_WEBHOOK_SECRET || !safeCompare(request.headers.get("x-github-webhook-secret-token"), GH_WEBHOOK_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await request.json();
  const jobId = payload.job_id || extractJobId(payload.branch);
  if (!jobId) return Response.json({ ok: true, skipped: true, reason: "not a job" });
  try {
    const results = {
      job: payload.job || "",
      pr_url: payload.pr_url || payload.run_url || "",
      run_url: payload.run_url || "",
      status: payload.status || "",
      merge_result: payload.merge_result || "",
      log: payload.log || "",
      changed_files: payload.changed_files || [],
      commit_message: payload.commit_message || ""
    };
    const message = await summarizeJob(results);
    await createNotification(message, payload);
    sendChannelNotifications(message).catch((err) => {
      console.error("Failed to send channel notifications:", err);
    });
    try {
      const { completeJob, failJob } = await import("../lib/db/jobs.js");
      const isFailure = ["failure", "cancelled", "timed_out"].includes(payload.status || "");
      if (isFailure) {
        failJob(jobId, payload.status || "failure");
      } else {
        completeJob(jobId, { summary: message, result: JSON.stringify(results), prUrl: results.pr_url });
      }
      if (!isFailure) {
        import("../lib/memory/index.js").then((m) => {
          m.extractMemoriesFromJob(jobId, results).catch((err) => {
            console.error("Memory extraction failed:", err.message);
          });
        });
      }
    } catch (err) {
      console.error("Failed to update job record:", err.message);
    }
    console.log(`Notification saved for job ${jobId.slice(0, 8)}`);
    return Response.json({ ok: true, notified: true });
  } catch (err) {
    console.error("Failed to process GitHub webhook:", err);
    return Response.json({ error: "Failed to process webhook" }, { status: 500 });
  }
}
async function handleJobStatus(request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("job_id");
    try {
      const { getJobById, getActiveJobs } = await import("../lib/db/jobs.js");
      if (jobId) {
        const job = getJobById(jobId);
        if (job) return Response.json(job);
      } else {
        const active = getActiveJobs();
        if (active.length > 0) return Response.json(active);
      }
    } catch {
    }
    const result = await getJobStatus(jobId ?? void 0);
    return Response.json(result);
  } catch (err) {
    console.error("Failed to get job status:", err);
    return Response.json({ error: "Failed to get job status" }, { status: 500 });
  }
}
async function sendChannelNotifications(message) {
  try {
    const { getDb } = await import("../lib/db/index.js");
    const { subscriptions } = await import("../lib/db/schema.js");
    const db = getDb();
    const subs = db.select().from(subscriptions).all();
    if (!subs || subs.length === 0) return;
    const registry = getChannelRegistry();
    for (const sub of subs) {
      try {
        const entry = registry.getById(sub.platform);
        if (entry?.adapter) {
          await entry.adapter.sendResponse(sub.channelId, message, {});
        }
      } catch (err) {
        console.error(`[notify] Failed to send to ${sub.platform}/${sub.channelId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[notify] Failed to send channel notifications:", err.message);
  }
}
async function POST(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, "");
  const authError = checkAuth(routePath, request);
  if (authError) return authError;
  try {
    const fireTriggers = getFireTriggers();
    const clonedRequest = request.clone();
    const body = await clonedRequest.json().catch(() => ({}));
    const query = Object.fromEntries(url.searchParams);
    const headers = Object.fromEntries(request.headers);
    fireTriggers(routePath, body, query, headers);
  } catch (e) {
  }
  switch (routePath) {
    case "/create-job":
      return handleWebhook(request);
    case "/telegram/webhook":
      return handleTelegramWebhook(request);
    case "/telegram/register":
      return handleTelegramRegister(request);
    case "/github/webhook":
      return handleGithubWebhook(request);
    default: {
      const registry = getChannelRegistry();
      if (registry.getByRoute(routePath)) {
        return handleChannelWebhook(request, routePath);
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }
}
async function GET(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, "");
  const authError = checkAuth(routePath, request);
  if (authError) return authError;
  switch (routePath) {
    case "/ping":
      return Response.json({ message: "Pong!" });
    case "/jobs/status":
      return handleJobStatus(request);
    default: {
      const registry = getChannelRegistry();
      if (registry.getByRoute(routePath)) {
        return handleChannelWebhook(request, routePath);
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }
}
export {
  GET,
  POST
};
