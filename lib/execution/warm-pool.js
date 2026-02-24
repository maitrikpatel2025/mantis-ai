import http from 'http';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getJobDockerImage, getWarmPoolSize, getWarmPoolMaxJobs, getWarmPoolMaxLifetime, getWarmPoolPortStart } from './router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEALTH_INTERVAL_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const STARTUP_TIMEOUT_MS = 180_000; // 3 min for clone + deps

let singleton = null;

/**
 * Get the warm pool singleton (or null if not initialized).
 * @returns {WarmPool|null}
 */
export function getWarmPool() {
  return singleton;
}

/**
 * Initialize the warm pool singleton.
 * @returns {Promise<WarmPool>}
 */
export async function initWarmPool() {
  if (singleton) return singleton;
  const size = getWarmPoolSize();
  if (size <= 0) return null;
  singleton = new WarmPool(size);
  await singleton.init();
  return singleton;
}

/**
 * Gracefully shutdown the warm pool.
 */
export async function shutdownWarmPool() {
  if (!singleton) return;
  await singleton.shutdown();
  singleton = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Secret builders (same as local-runner.js)
// ─────────────────────────────────────────────────────────────────────────────

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

function buildLlmSecretsJson() {
  const secrets = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('AGENT_LLM_')) {
      secrets[key.slice(10)] = value;
    }
  }
  return JSON.stringify(secrets);
}

// ─────────────────────────────────────────────────────────────────────────────
// WarmPool class
// ─────────────────────────────────────────────────────────────────────────────

class WarmPool {
  constructor(size) {
    this.size = size;
    this.workers = [];
    this.healthTimer = null;
    this.shuttingDown = false;
  }

  /**
   * Clean up orphans from previous runs, spawn fresh containers,
   * and wait until they report ready.
   */
  async init() {
    console.log(`[warm-pool] Initializing pool with ${this.size} worker(s)...`);
    await this._cleanupOrphans();

    const portStart = getWarmPoolPortStart();
    for (let i = 0; i < this.size; i++) {
      const worker = {
        index: i,
        containerId: null,
        containerName: `mantis-warm-${i}`,
        port: portStart + i,
        status: 'starting',
        jobsRun: 0,
        startedAt: Date.now(),
        currentJobId: null,
        consecutiveFailures: 0,
      };
      this.workers.push(worker);
      await this._spawnWorker(worker);
    }

    // Wait for all workers to become ready
    await this._waitForReady();

    // Start health check loop
    this.healthTimer = setInterval(() => this._healthCheck(), HEALTH_INTERVAL_MS);

    console.log(`[warm-pool] Pool ready: ${this.workers.filter((w) => w.status === 'ready').length}/${this.size} workers`);
  }

  /**
   * Check if any worker is available for a job.
   * @returns {boolean}
   */
  hasAvailableWorker() {
    return this.workers.some((w) => w.status === 'ready');
  }

  /**
   * Assign a job to an available worker.
   * Returns a promise that resolves when the job completes.
   * @param {string} jobId
   * @param {string} branch
   * @returns {Promise<void>}
   */
  async assignJob(jobId, branch) {
    const worker = this.workers.find((w) => w.status === 'ready');
    if (!worker) throw new Error('No available workers');

    worker.status = 'busy';
    worker.currentJobId = jobId;
    console.log(`[warm-pool] Assigning job ${jobId} to worker ${worker.index} (port ${worker.port})`);

    try {
      const response = await this._fetch(worker.port, '/run', { jobId, branch });

      worker.status = 'ready';
      worker.currentJobId = null;
      worker.jobsRun++;
      worker.consecutiveFailures = 0;

      if (response.status === 'completed') {
        console.log(`[warm-pool] Job ${jobId} completed on worker ${worker.index}`);
        try {
          const { updateJob } = await import('../db/jobs.js');
          updateJob(jobId, { status: 'completed', completedAt: Date.now() });
        } catch (err) {
          console.error(`[warm-pool] Failed to update job ${jobId}:`, err.message);
        }

        // Extract memories
        try {
          const { extractMemoriesFromJob } = await import('../memory/index.js');
          await extractMemoriesFromJob(jobId);
        } catch (err) {
          console.error(`[warm-pool] Memory extraction failed for ${jobId}:`, err.message);
        }

        // Create notification
        try {
          const { createNotification } = await import('../db/notifications.js');
          createNotification(`Job ${jobId.slice(0, 8)} completed (warm)`);
        } catch {}
      } else {
        console.error(`[warm-pool] Job ${jobId} failed on worker ${worker.index}: ${response.error}`);
        try {
          const { updateJob } = await import('../db/jobs.js');
          updateJob(jobId, { status: 'failed', completedAt: Date.now(), error: response.error });
        } catch {}

        try {
          const { createNotification } = await import('../db/notifications.js');
          createNotification(`Job ${jobId.slice(0, 8)} failed (warm): ${(response.error || '').slice(0, 100)}`);
        } catch {}
      }

      // Check if worker needs recycling
      this._checkRecycle(worker);
    } catch (err) {
      // HTTP error — worker crashed
      console.error(`[warm-pool] Worker ${worker.index} unreachable during job ${jobId}: ${err.message}`);
      worker.status = 'dead';
      worker.currentJobId = null;

      // Respawn worker
      this._recycleWorker(worker).catch((e) =>
        console.error(`[warm-pool] Failed to recycle worker ${worker.index}:`, e.message)
      );

      // Fall back to cold execution
      console.log(`[warm-pool] Falling back to cold execution for job ${jobId}`);
      try {
        const { updateJob } = await import('../db/jobs.js');
        updateJob(jobId, { runnerType: 'local' });
      } catch {}

      const { runJobLocally } = await import('./local-runner.js');
      await runJobLocally(jobId, branch);
    }
  }

  /**
   * Cancel a running job on its worker.
   * @param {string} jobId
   * @returns {boolean}
   */
  cancelJob(jobId) {
    const worker = this.workers.find((w) => w.currentJobId === jobId);
    if (!worker) return false;

    console.log(`[warm-pool] Cancelling job ${jobId} on worker ${worker.index}`);
    this._fetch(worker.port, '/cancel', {}).catch(() => {});
    return true;
  }

  /**
   * Get pool status for dashboard.
   * @returns {object}
   */
  getStatus() {
    return {
      size: this.size,
      available: this.workers.filter((w) => w.status === 'ready').length,
      busy: this.workers.filter((w) => w.status === 'busy').length,
      workers: this.workers.map((w) => ({
        index: w.index,
        status: w.status,
        port: w.port,
        jobsRun: w.jobsRun,
        currentJobId: w.currentJobId,
        uptimeSeconds: Math.floor((Date.now() - w.startedAt) / 1000),
      })),
    };
  }

  /**
   * Gracefully shutdown all workers.
   */
  async shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    console.log('[warm-pool] Shutting down...');

    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    await Promise.all(this.workers.map(async (worker) => {
      try {
        await this._fetch(worker.port, '/shutdown', {}).catch(() => {});
      } catch {}

      // Force stop container
      try {
        execSync(`docker stop ${worker.containerName}`, { stdio: 'ignore', timeout: 15000 });
      } catch {}
      try {
        execSync(`docker rm -f ${worker.containerName}`, { stdio: 'ignore', timeout: 5000 });
      } catch {}
    }));

    console.log('[warm-pool] All workers stopped');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private methods
  // ───────────────────────────────────────────────────────────────────────────

  async _cleanupOrphans() {
    try {
      const output = execSync(
        "docker ps -a --filter label=mantis-warm --format '{{.Names}}'",
        { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }
      ).toString().trim();

      if (!output) return;

      const names = output.split('\n').filter(Boolean);
      console.log(`[warm-pool] Cleaning up ${names.length} orphaned warm container(s)...`);
      for (const name of names) {
        try {
          execSync(`docker rm -f ${name}`, { stdio: 'ignore', timeout: 10000 });
        } catch {}
      }
    } catch {}
  }

  async _spawnWorker(worker) {
    const { GH_OWNER, GH_REPO, LLM_MODEL, LLM_PROVIDER, OPENAI_BASE_URL } = process.env;
    const image = getJobDockerImage();
    const repoUrl = `https://github.com/${GH_OWNER}/${GH_REPO}.git`;
    const workerScript = resolve(__dirname, 'warm-worker.js');

    const args = [
      'run', '-d',
      '--name', worker.containerName,
      '--label', 'mantis-warm=true',
      '-p', `${worker.port}:8080`,
      '-v', `${workerScript}:/warm-worker.js:ro`,
      '-e', `REPO_URL=${repoUrl}`,
      '-e', `SECRETS=${buildSecretsJson()}`,
      '-e', `LLM_SECRETS=${buildLlmSecretsJson()}`,
    ];

    if (LLM_MODEL) args.push('-e', `LLM_MODEL=${LLM_MODEL}`);
    if (LLM_PROVIDER) args.push('-e', `LLM_PROVIDER=${LLM_PROVIDER}`);
    if (OPENAI_BASE_URL) args.push('-e', `OPENAI_BASE_URL=${OPENAI_BASE_URL}`);

    args.push('--entrypoint', 'node', image, '/warm-worker.js');

    console.log(`[warm-pool] Spawning worker ${worker.index} on port ${worker.port}...`);

    try {
      const containerId = execSync(`docker ${args.join(' ')}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      }).toString().trim();

      worker.containerId = containerId.slice(0, 12);
      worker.status = 'starting';
      worker.startedAt = Date.now();
      worker.jobsRun = 0;
      worker.consecutiveFailures = 0;
    } catch (err) {
      console.error(`[warm-pool] Failed to spawn worker ${worker.index}:`, err.message);
      worker.status = 'dead';
    }
  }

  async _waitForReady() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    const startingWorkers = this.workers.filter((w) => w.status === 'starting');

    while (Date.now() < deadline && startingWorkers.some((w) => w.status === 'starting')) {
      await new Promise((r) => setTimeout(r, 3000));
      for (const worker of startingWorkers) {
        if (worker.status !== 'starting') continue;
        try {
          const health = await this._fetchHealth(worker.port);
          if (health.ready) {
            worker.status = 'ready';
            console.log(`[warm-pool] Worker ${worker.index} ready`);
          }
        } catch {
          // Not ready yet
        }
      }
    }

    // Mark any still-starting workers as dead
    for (const worker of startingWorkers) {
      if (worker.status === 'starting') {
        console.error(`[warm-pool] Worker ${worker.index} failed to start within timeout`);
        worker.status = 'dead';
      }
    }
  }

  async _healthCheck() {
    if (this.shuttingDown) return;

    for (const worker of this.workers) {
      if (worker.status === 'dead' || worker.status === 'recycling') continue;

      try {
        const health = await this._fetchHealth(worker.port);
        worker.consecutiveFailures = 0;

        // Update local state from worker
        if (health.ready && !health.busy && worker.status !== 'busy') {
          worker.status = 'ready';
        }
      } catch {
        worker.consecutiveFailures++;
        if (worker.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`[warm-pool] Worker ${worker.index} failed ${MAX_CONSECUTIVE_FAILURES} health checks, recycling...`);
          this._recycleWorker(worker).catch((e) =>
            console.error(`[warm-pool] Recycle failed for worker ${worker.index}:`, e.message)
          );
        }
      }

      // Check age/job-based recycling for idle workers
      if (worker.status === 'ready') {
        this._checkRecycle(worker);
      }
    }
  }

  _checkRecycle(worker) {
    const maxJobs = getWarmPoolMaxJobs();
    const maxLifetime = getWarmPoolMaxLifetime() * 1000;

    if (worker.jobsRun >= maxJobs) {
      console.log(`[warm-pool] Worker ${worker.index} hit max jobs (${worker.jobsRun}/${maxJobs}), recycling...`);
      this._recycleWorker(worker).catch(() => {});
      return;
    }

    if (Date.now() - worker.startedAt >= maxLifetime) {
      console.log(`[warm-pool] Worker ${worker.index} exceeded max lifetime, recycling...`);
      this._recycleWorker(worker).catch(() => {});
    }
  }

  async _recycleWorker(worker) {
    if (worker.status === 'recycling') return;
    worker.status = 'recycling';

    // Stop and remove old container
    try {
      await this._fetch(worker.port, '/shutdown', {}).catch(() => {});
    } catch {}
    try {
      execSync(`docker rm -f ${worker.containerName}`, { stdio: 'ignore', timeout: 15000 });
    } catch {}

    // Spawn fresh
    await this._spawnWorker(worker);

    // Wait for ready
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline && worker.status === 'starting') {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const health = await this._fetchHealth(worker.port);
        if (health.ready) {
          worker.status = 'ready';
          console.log(`[warm-pool] Worker ${worker.index} recycled and ready`);
        }
      } catch {}
    }

    if (worker.status === 'starting') {
      worker.status = 'dead';
      console.error(`[warm-pool] Worker ${worker.index} failed to restart after recycle`);
    }
  }

  _fetchHealth(port) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  _fetch(port, path, body) {
    const payload = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 600_000, // 10 min for long jobs
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(payload);
      req.end();
    });
  }
}
