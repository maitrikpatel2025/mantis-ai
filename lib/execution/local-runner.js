import { spawn, execSync } from 'child_process';
import { getJobDockerImage } from './router.js';

const MAX_LOG_BYTES = 512 * 1024; // 512KB cap per stream
const activeJobs = new Map();     // jobId -> { process, containerName }
const pendingQueue = [];          // { jobId, branch, resolve, reject, queuedAt }
let running = 0;
let draining = false;

function getMaxConcurrent() {
  return parseInt(process.env.LOCAL_MAX_CONCURRENT || '2', 10);
}

/**
 * Capped log buffer — keeps only the last MAX_LOG_BYTES of output.
 */
class LogBuffer {
  constructor(maxBytes = MAX_LOG_BYTES) {
    this.chunks = [];
    this.totalBytes = 0;
    this.maxBytes = maxBytes;
  }
  append(str) {
    const bytes = Buffer.byteLength(str);
    this.chunks.push(str);
    this.totalBytes += bytes;
    // Trim from front when over budget
    while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift();
      this.totalBytes -= Buffer.byteLength(removed);
    }
  }
  toString() {
    return this.chunks.join('');
  }
}

/**
 * Build the SECRETS JSON from local env vars.
 * Mirrors the GitHub Actions logic: AGENT_* (excluding AGENT_LLM_*) -> strip prefix.
 * Falls back to common env vars if no AGENT_* vars are set.
 */
function buildSecretsJson() {
  const secrets = {};
  let hasAgentSecrets = false;

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('AGENT_') && !key.startsWith('AGENT_LLM_')) {
      secrets[key.slice(6)] = value;
      hasAgentSecrets = true;
    }
  }

  if (!hasAgentSecrets) {
    if (process.env.GH_TOKEN) secrets.GH_TOKEN = process.env.GH_TOKEN;
    if (process.env.ANTHROPIC_API_KEY) secrets.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (process.env.OPENAI_API_KEY) secrets.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (process.env.GOOGLE_API_KEY) secrets.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    if (process.env.CUSTOM_API_KEY) secrets.CUSTOM_API_KEY = process.env.CUSTOM_API_KEY;
  }

  return JSON.stringify(secrets);
}

/**
 * Build the LLM_SECRETS JSON from AGENT_LLM_* env vars.
 */
function buildLlmSecretsJson() {
  const secrets = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('AGENT_LLM_')) {
      secrets[key.slice(10)] = value;
    }
  }
  return JSON.stringify(secrets);
}

/**
 * Run a job in a local Docker container.
 * @param {string} jobId
 * @param {string} branch - e.g. "job/<uuid>"
 * @returns {Promise<void>} Resolves when container exits
 */
export async function runJobLocally(jobId, branch) {
  const max = getMaxConcurrent();
  if (running >= max) {
    return new Promise((resolve, reject) => {
      pendingQueue.push({ jobId, branch, resolve, reject, queuedAt: Date.now() });
      console.log(`[local-runner] Job ${jobId} queued (${pendingQueue.length} waiting, ${running}/${max} running)`);
    });
  }

  return executeJob(jobId, branch);
}

async function executeJob(jobId, branch) {
  running++;
  const { GH_OWNER, GH_REPO, LLM_MODEL, LLM_PROVIDER, OPENAI_BASE_URL } = process.env;
  const image = getJobDockerImage();
  const repoUrl = `https://github.com/${GH_OWNER}/${GH_REPO}.git`;
  const containerName = `mantis-job-${jobId.slice(0, 8)}`;

  const args = [
    'run', '--rm',
    '--name', containerName,
    '--label', `mantis-job=${jobId}`,
    '-e', `REPO_URL=${repoUrl}`,
    '-e', `BRANCH=${branch}`,
    '-e', `SECRETS=${buildSecretsJson()}`,
    '-e', `LLM_SECRETS=${buildLlmSecretsJson()}`,
  ];

  if (LLM_MODEL) args.push('-e', `LLM_MODEL=${LLM_MODEL}`);
  if (LLM_PROVIDER) args.push('-e', `LLM_PROVIDER=${LLM_PROVIDER}`);
  if (OPENAI_BASE_URL) args.push('-e', `OPENAI_BASE_URL=${OPENAI_BASE_URL}`);

  args.push(image);

  console.log(`[local-runner] Starting job ${jobId} (${running}/${getMaxConcurrent()} slots) image=${image}`);

  const { updateJob } = await import('../db/jobs.js');

  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    activeJobs.set(jobId, { process: child, containerName });

    const stdoutBuf = new LogBuffer();
    const stderrBuf = new LogBuffer();

    child.stdout.on('data', (data) => {
      const line = data.toString();
      stdoutBuf.append(line);
      process.stdout.write(`[job:${jobId.slice(0, 8)}] ${line}`);
    });

    child.stderr.on('data', (data) => {
      const line = data.toString();
      stderrBuf.append(line);
      process.stderr.write(`[job:${jobId.slice(0, 8)}] ${line}`);
    });

    child.on('close', async (code) => {
      activeJobs.delete(jobId);
      running--;

      if (code === 0) {
        console.log(`[local-runner] Job ${jobId} completed successfully`);
        try {
          updateJob(jobId, { status: 'completed', completedAt: Date.now() });
        } catch (err) {
          console.error(`[local-runner] Failed to update job ${jobId}:`, err.message);
        }

        // Trigger memory extraction
        try {
          const { extractMemoriesFromJob } = await import('../memory/index.js');
          await extractMemoriesFromJob(jobId);
        } catch (err) {
          console.error(`[local-runner] Memory extraction failed for ${jobId}:`, err.message);
        }

        // Create notification
        try {
          const { createNotification } = await import('../db/notifications.js');
          createNotification(`Job ${jobId.slice(0, 8)} completed (local)`);
        } catch (err) {
          console.error(`[local-runner] Notification failed for ${jobId}:`, err.message);
        }
      } else {
        const errorMsg = stderrBuf.toString().slice(-500) || `Container exited with code ${code}`;
        console.error(`[local-runner] Job ${jobId} failed (exit code ${code})`);
        try {
          updateJob(jobId, { status: 'failed', completedAt: Date.now(), error: errorMsg });
        } catch (err) {
          console.error(`[local-runner] Failed to update job ${jobId}:`, err.message);
        }

        try {
          const { createNotification } = await import('../db/notifications.js');
          createNotification(`Job ${jobId.slice(0, 8)} failed (local): exit code ${code}`);
        } catch {}
      }

      drainQueue();
      resolve();
    });

    child.on('error', (err) => {
      activeJobs.delete(jobId);
      running--;
      console.error(`[local-runner] Docker spawn failed for ${jobId}:`, err.message);
      try {
        updateJob(jobId, { status: 'failed', completedAt: Date.now(), error: err.message });
      } catch {}
      drainQueue();
      reject(err);
    });
  });
}

/**
 * Drain the pending queue, starting jobs up to max concurrency.
 * Uses a flag to prevent concurrent drain calls from dequeuing the same job.
 */
function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    while (pendingQueue.length > 0 && running < getMaxConcurrent()) {
      const next = pendingQueue.shift();
      executeJob(next.jobId, next.branch).then(next.resolve).catch(next.reject);
    }
  } finally {
    draining = false;
  }
}

/**
 * Cancel a locally-running job by stopping its Docker container.
 * @param {string} jobId
 * @returns {boolean} true if cancelled
 */
export function cancelLocalJob(jobId) {
  const entry = activeJobs.get(jobId);
  if (entry) {
    try {
      execSync(`docker stop ${entry.containerName}`, { stdio: 'ignore', timeout: 15000 });
    } catch {
      try { entry.process.kill('SIGTERM'); } catch {}
    }
    return true;
  }

  // Check pending queue
  const idx = pendingQueue.findIndex((p) => p.jobId === jobId);
  if (idx !== -1) {
    const removed = pendingQueue.splice(idx, 1)[0];
    removed.resolve();
    return true;
  }

  return false;
}

/**
 * Get list of active local jobs.
 * @returns {Array<{ jobId: string, containerName: string }>}
 */
export function getActiveLocalJobs() {
  return Array.from(activeJobs.entries()).map(([jobId, { containerName }]) => ({
    jobId,
    containerName,
  }));
}

/**
 * Clean up orphaned mantis-job containers on startup.
 * Finds containers with the mantis-job label that are still running
 * and reconciles their state in the database.
 */
export async function cleanupOrphanedContainers() {
  try {
    // Use single-quoted format string to avoid shell escaping issues with Go templates
    const output = execSync(
      "docker ps --filter label=mantis-job --format '{{.Names}} {{.Label \"mantis-job\"}}'",
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }
    ).toString().trim();

    if (!output) return;

    const lines = output.split('\n').filter(Boolean);
    console.log(`[local-runner] Found ${lines.length} orphaned container(s), stopping...`);

    const { getJobById, updateJob } = await import('../db/jobs.js');

    for (const line of lines) {
      // Format: "container-name job-id"
      const spaceIdx = line.indexOf(' ');
      const containerName = spaceIdx > 0 ? line.slice(0, spaceIdx) : line;
      const jobId = spaceIdx > 0 ? line.slice(spaceIdx + 1).trim() : null;
      if (!containerName) continue;

      try {
        execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 15000 });
        console.log(`[local-runner] Stopped orphaned container: ${containerName}`);
      } catch {
        console.error(`[local-runner] Failed to stop orphaned container: ${containerName}`);
      }

      // Mark as failed in DB if still active
      if (jobId) {
        try {
          const job = getJobById(jobId);
          if (job && (job.status === 'created' || job.status === 'queued')) {
            updateJob(jobId, {
              status: 'failed',
              completedAt: Date.now(),
              error: 'Orphaned: event handler restarted while job was running',
            });
          }
        } catch {}
      }
    }
  } catch (err) {
    // Docker not available or no orphaned containers — that's fine
    if (err.status !== undefined) return; // execSync non-zero exit
    console.error('[local-runner] Orphan cleanup error:', err.message);
  }
}
