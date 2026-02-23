import { createHash, timingSafeEqual } from 'crypto';
import { createJob } from '../lib/tools/create-job.js';
import { setWebhook } from '../lib/tools/telegram.js';
import { getJobStatus } from '../lib/tools/github.js';
import { getTelegramAdapter } from '../lib/channels/index.js';
import { getChannelRegistry } from '../lib/channels/registry.js';
import { chat, chatWithAgent, summarizeJob } from '../lib/ai/index.js';
import { createNotification } from '../lib/db/notifications.js';
import { loadTriggers } from '../lib/triggers.js';
import { verifyApiKey } from '../lib/db/api-keys.js';

// Bot token from env, can be overridden by /telegram/register
let telegramBotToken = null;

// Cached trigger firing function (initialized on first request)
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

// Static routes that have their own authentication
const STATIC_PUBLIC_ROUTES = ['/telegram/webhook', '/github/webhook', '/ping'];

/**
 * Get all public routes (static + dynamic channel webhook paths).
 * @returns {string[]}
 */
function getPublicRoutes() {
  const registry = getChannelRegistry();
  const channelPaths = registry.getWebhookPaths();
  // Merge static and dynamic, deduped
  return [...new Set([...STATIC_PUBLIC_ROUTES, ...channelPaths])];
}

/**
 * Timing-safe string comparison.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Centralized auth gate for all API routes.
 * Public routes pass through; everything else requires a valid API key from the database.
 * @param {string} routePath - The route path
 * @param {Request} request - The incoming request
 * @returns {Response|null} - Error response or null if authorized
 */
function checkAuth(routePath, request) {
  if (getPublicRoutes().includes(routePath)) return null;

  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const record = verifyApiKey(apiKey);
  if (!record) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

/**
 * Extract job ID from branch name (e.g., "job/abc123" -> "abc123")
 */
function extractJobId(branchName) {
  if (!branchName || !branchName.startsWith('job/')) return null;
  return branchName.slice(4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleWebhook(request) {
  const body = await request.json();
  const { job } = body;
  if (!job) return Response.json({ error: 'Missing job field' }, { status: 400 });

  try {
    const result = await createJob(job);
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

async function handleTelegramRegister(request) {
  const body = await request.json();
  const { bot_token, webhook_url } = body;
  if (!bot_token || !webhook_url) {
    return Response.json({ error: 'Missing bot_token or webhook_url' }, { status: 400 });
  }

  try {
    const result = await setWebhook(bot_token, webhook_url, process.env.TELEGRAM_WEBHOOK_SECRET);
    telegramBotToken = bot_token;
    return Response.json({ success: true, result });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}

async function handleTelegramWebhook(request) {
  const botToken = getTelegramBotToken();
  if (!botToken) return Response.json({ ok: true });

  const adapter = getTelegramAdapter(botToken);
  const normalized = await adapter.receive(request);
  if (!normalized) return Response.json({ ok: true });

  // Process message asynchronously (don't block the webhook response)
  processChannelMessage(adapter, normalized, 'telegram').catch((err) => {
    console.error('Failed to process message:', err);
  });

  return Response.json({ ok: true });
}

/**
 * Handle a webhook from any registered channel via the channel registry.
 * @param {Request} request
 * @param {string} routePath
 * @returns {Promise<Response>}
 */
async function handleChannelWebhook(request, routePath) {
  const registry = getChannelRegistry();
  const match = registry.getByRoute(routePath);
  if (!match) return Response.json({ error: 'Not found' }, { status: 404 });

  const { id, adapter } = match;

  const normalized = await adapter.receive(request);
  if (!normalized) return Response.json({ ok: true });

  // Handle platform-specific handshake responses
  if (normalized._challenge !== undefined) {
    // Slack URL verification or WhatsApp verification challenge
    return new Response(normalized._challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  if (normalized._pong) {
    // Discord PING
    return Response.json({ type: 1 });
  }

  // Process message asynchronously (don't block the webhook response)
  processChannelMessage(adapter, normalized, id, match.config).catch((err) => {
    console.error(`[${id}] Failed to process message:`, err);
  });

  return Response.json({ ok: true });
}

/**
 * Process a normalized message through the AI layer with channel UX.
 * Message persistence is handled centrally by the AI layer.
 * If channelConfig.agent is set, routes to that sub-agent instead of the main agent.
 * @param {import('../lib/channels/base.js').ChannelAdapter} adapter
 * @param {object} normalized
 * @param {string} channelId - Channel identifier for userId (e.g., 'telegram', 'slack-main')
 * @param {object} [channelConfig] - Channel config from CHANNELS.json
 */
async function processChannelMessage(adapter, normalized, channelId, channelConfig) {
  await adapter.acknowledge(normalized.metadata);
  const stopIndicator = adapter.startProcessingIndicator(normalized.metadata);

  try {
    const agentName = channelConfig?.agent;
    const chatOptions = { userId: channelId, chatTitle: channelId };

    const response = agentName
      ? await chatWithAgent(agentName, normalized.threadId, normalized.text, normalized.attachments, chatOptions)
      : await chat(normalized.threadId, normalized.text, normalized.attachments, chatOptions);

    await adapter.sendResponse(normalized.threadId, response, normalized.metadata);
  } catch (err) {
    console.error('Failed to process message with AI:', err);
    await adapter
      .sendResponse(
        normalized.threadId,
        'Sorry, I encountered an error processing your message.',
        normalized.metadata
      )
      .catch(() => {});
  } finally {
    stopIndicator();
  }
}

async function handleGithubWebhook(request) {
  const { GH_WEBHOOK_SECRET } = process.env;

  // Validate webhook secret (timing-safe, required)
  if (!GH_WEBHOOK_SECRET || !safeCompare(request.headers.get('x-github-webhook-secret-token'), GH_WEBHOOK_SECRET)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const jobId = payload.job_id || extractJobId(payload.branch);
  if (!jobId) return Response.json({ ok: true, skipped: true, reason: 'not a job' });

  try {
    const results = {
      job: payload.job || '',
      pr_url: payload.pr_url || payload.run_url || '',
      run_url: payload.run_url || '',
      status: payload.status || '',
      merge_result: payload.merge_result || '',
      log: payload.log || '',
      changed_files: payload.changed_files || [],
      commit_message: payload.commit_message || '',
    };

    const message = await summarizeJob(results);
    await createNotification(message, payload);

    // Send notification to subscribed channels
    sendChannelNotifications(message).catch((err) => {
      console.error('Failed to send channel notifications:', err);
    });

    console.log(`Notification saved for job ${jobId.slice(0, 8)}`);

    return Response.json({ ok: true, notified: true });
  } catch (err) {
    console.error('Failed to process GitHub webhook:', err);
    return Response.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

async function handleJobStatus(request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('job_id');
    const result = await getJobStatus(jobId);
    return Response.json(result);
  } catch (err) {
    console.error('Failed to get job status:', err);
    return Response.json({ error: 'Failed to get job status' }, { status: 500 });
  }
}

/**
 * Send a notification message to all subscribed channels.
 * Uses the subscriptions table to find which channels/threads to notify.
 * @param {string} message - Notification message text
 */
async function sendChannelNotifications(message) {
  try {
    const { getDb } = await import('../lib/db/index.js');
    const { subscriptions } = await import('../lib/db/schema.js');
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
    console.error('[notify] Failed to send channel notifications:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Next.js Route Handlers (catch-all)
// ─────────────────────────────────────────────────────────────────────────────

async function POST(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');

  // Auth check
  const authError = checkAuth(routePath, request);
  if (authError) return authError;

  // Fire triggers (non-blocking)
  try {
    const fireTriggers = getFireTriggers();
    // Clone request to read body for triggers without consuming it for the handler
    const clonedRequest = request.clone();
    const body = await clonedRequest.json().catch(() => ({}));
    const query = Object.fromEntries(url.searchParams);
    const headers = Object.fromEntries(request.headers);
    fireTriggers(routePath, body, query, headers);
  } catch (e) {
    // Trigger errors are non-fatal
  }

  // Route to handler — check static routes first, then dynamic channel registry
  switch (routePath) {
    case '/create-job':          return handleWebhook(request);
    case '/telegram/webhook':   return handleTelegramWebhook(request);
    case '/telegram/register':  return handleTelegramRegister(request);
    case '/github/webhook':     return handleGithubWebhook(request);
    default: {
      // Check channel registry for dynamic webhook routes
      const registry = getChannelRegistry();
      if (registry.getByRoute(routePath)) {
        return handleChannelWebhook(request, routePath);
      }
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
  }
}

async function GET(request) {
  const url = new URL(request.url);
  const routePath = url.pathname.replace(/^\/api/, '');

  // Auth check
  const authError = checkAuth(routePath, request);
  if (authError) return authError;

  switch (routePath) {
    case '/ping':           return Response.json({ message: 'Pong!' });
    case '/jobs/status':    return handleJobStatus(request);
    default: {
      // Check channel registry for GET handlers (WhatsApp verification)
      const registry = getChannelRegistry();
      if (registry.getByRoute(routePath)) {
        return handleChannelWebhook(request, routePath);
      }
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
  }
}

export { GET, POST };
