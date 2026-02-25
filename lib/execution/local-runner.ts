import { spawn, execSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import { getJobDockerImage } from './router.js';

const MAX_LOG_BYTES: number = 512 * 1024; // 512KB cap per stream

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveJobEntry {
  process: ChildProcess;
  containerName: string;
}

interface PendingQueueEntry {
  jobId: string;
  branch: string;
  resolve: () => void;
  reject: (err: Error) => void;
  queuedAt: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const activeJobs = new Map<string, ActiveJobEntry>();
const pendingQueue: PendingQueueEntry[] = [];
let running: number = 0;
let draining: boolean = false;

function getMaxConcurrent(): number {
  return parseInt(process.env.LOCAL_MAX_CONCURRENT || '2', 10);
}

// ---------------------------------------------------------------------------
// LogBuffer
// ---------------------------------------------------------------------------

/**
 * Capped log buffer -- keeps only the last MAX_LOG_BYTES of output.
 */
class LogBuffer {
  private chunks: string[] = [];
  private totalBytes: number = 0;
  private maxBytes: number;

  constructor(maxBytes: number = MAX_LOG_BYTES) {
    this.maxBytes = maxBytes;
  }

  append(str: string): void {
    const bytes: number = Buffer.byteLength(str);
    this.chunks.push(str);
    this.totalBytes += bytes;
    // Trim from front when over budget
    while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
      const removed: string = this.chunks.shift()!;
      this.totalBytes -= Buffer.byteLength(removed);
    }
  }

  toString(): string {
    return this.chunks.join('');
  }
}

// ---------------------------------------------------------------------------
// Secret builders
// ---------------------------------------------------------------------------

/**
 * Build the SECRETS JSON from local env vars.
 * Mirrors the GitHub Actions logic: AGENT_* (excluding AGENT_LLM_*) -> strip prefix.
 * Falls back to common env vars if no AGENT_* vars are set.
 */
function buildSecretsJson(): string {
  const secrets: Record<string, string | undefined> = {};
  let hasAgentSecrets: boolean = false;

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
function buildLlmSecretsJson(): string {
  const secrets: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('AGENT_LLM_')) {
      secrets[key.slice(10)] = value;
    }
  }
  return JSON.stringify(secrets);
}

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

/**
 * Run a job in a local Docker container.
 */
export async function runJobLocally(jobId: string, branch: string): Promise<void> {
  const max: number = getMaxConcurrent();
  if (running >= max) {
    return new Promise<void>((resolve, reject) => {
      pendingQueue.push({ jobId, branch, resolve, reject, queuedAt: Date.now() });
      console.log(`[local-runner] Job ${jobId} queued (${pendingQueue.length} waiting, ${running}/${max} running)`);
    });
  }

  return executeJob(jobId, branch);
}

async function executeJob(jobId: string, branch: string): Promise<void> {
  running++;
  const { GH_OWNER, GH_REPO, LLM_MODEL, LLM_PROVIDER, OPENAI_BASE_URL } = process.env;
  const image: string = getJobDockerImage();
  const repoUrl: string = `https://github.com/${GH_OWNER}/${GH_REPO}.git`;
  const containerName: string = `mantis-job-${jobId.slice(0, 8)}`;

  const args: string[] = [
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

  return new Promise<void>((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    activeJobs.set(jobId, { process: child, containerName });

    const stdoutBuf = new LogBuffer();
    const stderrBuf = new LogBuffer();

    child.stdout.on('data', (data: Buffer) => {
      const line: string = data.toString();
      stdoutBuf.append(line);
      process.stdout.write(`[job:${jobId.slice(0, 8)}] ${line}`);
    });

    child.stderr.on('data', (data: Buffer) => {
      const line: string = data.toString();
      stderrBuf.append(line);
      process.stderr.write(`[job:${jobId.slice(0, 8)}] ${line}`);
    });

    child.on('close', async (code: number | null) => {
      activeJobs.delete(jobId);
      running--;

      if (code === 0) {
        console.log(`[local-runner] Job ${jobId} completed successfully`);
        try {
          updateJob(jobId, { status: 'completed', completedAt: Date.now() });
        } catch (err) {
          console.error(`[local-runner] Failed to update job ${jobId}:`, (err as Error).message);
        }

        // Trigger memory extraction
        try {
          const { extractMemoriesFromJob } = await import('../memory/index.js');
          await extractMemoriesFromJob(jobId, {});
        } catch (err) {
          console.error(`[local-runner] Memory extraction failed for ${jobId}:`, (err as Error).message);
        }

        // Create notification
        try {
          const { createNotification } = await import('../db/notifications.js');
          createNotification(`Job ${jobId.slice(0, 8)} completed (local)`, { jobId });
        } catch (err) {
          console.error(`[local-runner] Notification failed for ${jobId}:`, (err as Error).message);
        }
      } else {
        const errorMsg: string = stderrBuf.toString().slice(-500) || `Container exited with code ${code}`;
        console.error(`[local-runner] Job ${jobId} failed (exit code ${code})`);
        try {
          updateJob(jobId, { status: 'failed', completedAt: Date.now(), error: errorMsg });
        } catch (err) {
          console.error(`[local-runner] Failed to update job ${jobId}:`, (err as Error).message);
        }

        try {
          const { createNotification } = await import('../db/notifications.js');
          createNotification(`Job ${jobId.slice(0, 8)} failed (local): exit code ${code}`, { jobId });
        } catch {}
      }

      drainQueue();
      resolve();
    });

    child.on('error', (err: Error) => {
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
function drainQueue(): void {
  if (draining) return;
  draining = true;
  try {
    while (pendingQueue.length > 0 && running < getMaxConcurrent()) {
      const next: PendingQueueEntry = pendingQueue.shift()!;
      executeJob(next.jobId, next.branch).then(next.resolve).catch(next.reject);
    }
  } finally {
    draining = false;
  }
}

/**
 * Cancel a locally-running job by stopping its Docker container.
 */
export function cancelLocalJob(jobId: string): boolean {
  const entry: ActiveJobEntry | undefined = activeJobs.get(jobId);
  if (entry) {
    try {
      execSync(`docker stop ${entry.containerName}`, { stdio: 'ignore', timeout: 15000 });
    } catch {
      try { entry.process.kill('SIGTERM'); } catch {}
    }
    return true;
  }

  // Check pending queue
  const idx: number = pendingQueue.findIndex((p) => p.jobId === jobId);
  if (idx !== -1) {
    const removed: PendingQueueEntry = pendingQueue.splice(idx, 1)[0];
    removed.resolve();
    return true;
  }

  return false;
}

/**
 * Get list of active local jobs.
 */
export function getActiveLocalJobs(): Array<{ jobId: string; containerName: string }> {
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
export async function cleanupOrphanedContainers(): Promise<void> {
  try {
    // Use single-quoted format string to avoid shell escaping issues with Go templates
    const output: string = execSync(
      "docker ps --filter label=mantis-job --format '{{.Names}} {{.Label \"mantis-job\"}}'",
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }
    ).toString().trim();

    if (!output) return;

    const lines: string[] = output.split('\n').filter(Boolean);
    console.log(`[local-runner] Found ${lines.length} orphaned container(s), stopping...`);

    const { getJobById, updateJob } = await import('../db/jobs.js');

    for (const line of lines) {
      // Format: "container-name job-id"
      const spaceIdx: number = line.indexOf(' ');
      const containerName: string = spaceIdx > 0 ? line.slice(0, spaceIdx) : line;
      const jobId: string | null = spaceIdx > 0 ? line.slice(spaceIdx + 1).trim() : null;
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
    // Docker not available or no orphaned containers -- that's fine
    if ((err as Record<string, unknown>).status !== undefined) return; // execSync non-zero exit
    console.error('[local-runner] Orphan cleanup error:', (err as Error).message);
  }
}
