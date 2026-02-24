import http from 'http';
import { execSync, execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getJobDockerImage } from './router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTAINER_NAME = 'mantis-workspace';
const STARTUP_TIMEOUT_MS = 120_000; // 2 min
const HEALTH_INTERVAL_MS = 30_000;
const GLOBALTHIS_KEY = '__mantis_workspace';

// ── Config readers ──────────────────────────────────────────────────────────

export function isWorkspaceEnabled() {
  return process.env.WORKSPACE_ENABLED === 'true' || process.env.WORKSPACE_ENABLED === '1';
}

function getWorkspacePort() {
  return parseInt(process.env.WORKSPACE_PORT || '9200', 10);
}

function getIdleTimeout() {
  return parseInt(process.env.WORKSPACE_IDLE_TIMEOUT || '1800', 10);
}

/**
 * Parse DOCKER_HOST to get the hostname for HTTP requests.
 * Docker CLI natively uses DOCKER_HOST for container management,
 * but our HTTP calls to the container need the actual hostname.
 */
function getDockerHostname() {
  const dockerHost = process.env.DOCKER_HOST;
  if (!dockerHost) return '127.0.0.1';
  try {
    const url = new URL(dockerHost);
    return url.hostname;
  } catch {
    return '127.0.0.1';
  }
}

// ── Secret builders (same as warm-pool.js) ──────────────────────────────────

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

// ── WorkspaceManager class ──────────────────────────────────────────────────

class WorkspaceManager {
  constructor() {
    this.containerId = null;
    this.status = 'stopped';  // stopped | starting | ready | dead
    this.healthTimer = null;
    this.startedAt = null;
    this.lastActivityAt = null;
    this._startPromise = null;
  }

  /**
   * Ensure the workspace is running. Lazy start on first call.
   * Safe to call concurrently — deduplicates via _startPromise.
   */
  async ensureRunning() {
    if (this.status === 'ready') {
      this.lastActivityAt = Date.now();
      return;
    }
    if (this.status === 'starting' && this._startPromise) {
      return this._startPromise;
    }
    this._startPromise = this._start();
    try {
      await this._startPromise;
    } finally {
      this._startPromise = null;
    }
  }

  async _start() {
    console.log('[workspace] Starting workspace container...');
    await this._cleanupOrphan();
    this.status = 'starting';

    const image = getJobDockerImage();
    const port = getWorkspacePort();
    const idleTimeout = getIdleTimeout();
    const workerScript = resolve(__dirname, 'workspace-worker.js');

    const { LLM_MODEL, LLM_PROVIDER, OPENAI_BASE_URL } = process.env;

    const args = [
      'run', '-d',
      '--name', CONTAINER_NAME,
      '--label', 'mantis-workspace=true',
      '-p', `${port}:8080`,
      '-v', `${workerScript}:/workspace-worker.js:ro`,
      '-e', `IDLE_TIMEOUT=${idleTimeout}`,
      '-e', `SECRETS=${buildSecretsJson()}`,
      '-e', `LLM_SECRETS=${buildLlmSecretsJson()}`,
    ];

    if (LLM_MODEL) args.push('-e', `LLM_MODEL=${LLM_MODEL}`);
    if (LLM_PROVIDER) args.push('-e', `LLM_PROVIDER=${LLM_PROVIDER}`);
    if (OPENAI_BASE_URL) args.push('-e', `OPENAI_BASE_URL=${OPENAI_BASE_URL}`);

    args.push('--entrypoint', 'node', image, '/workspace-worker.js');

    try {
      // Use execFileSync to avoid shell interpretation of JSON in env vars
      const containerId = execFileSync('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      }).toString().trim();

      this.containerId = containerId.slice(0, 12);
      this.startedAt = Date.now();
      this.lastActivityAt = Date.now();
    } catch (err) {
      this.status = 'dead';
      throw new Error(`Failed to start workspace: ${err.message}`);
    }

    await this._waitForReady();

    this.healthTimer = setInterval(() => this._healthCheck(), HEALTH_INTERVAL_MS);
    console.log(`[workspace] Container ready on port ${port}`);
  }

  async _waitForReady() {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    const port = getWorkspacePort();
    const host = getDockerHostname();

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const health = await this._fetchHealth(host, port);
        if (health.ready) {
          this.status = 'ready';
          return;
        }
      } catch {}
    }

    this.status = 'dead';
    throw new Error('Workspace container failed to become ready within timeout');
  }

  async _healthCheck() {
    if (this.status !== 'ready') return;
    try {
      await this._fetchHealth(getDockerHostname(), getWorkspacePort());
    } catch {
      console.error('[workspace] Health check failed, marking dead');
      this.status = 'dead';
      if (this.healthTimer) {
        clearInterval(this.healthTimer);
        this.healthTimer = null;
      }
    }
  }

  async _cleanupOrphan() {
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore', timeout: 15000 });
    } catch {} // Not running, fine
  }

  /**
   * Make an HTTP request to the workspace container.
   * Auto-starts the container if not running.
   * @param {string} path - HTTP path (e.g., '/exec')
   * @param {object} body - Request body
   * @returns {Promise<object>} Response data
   */
  async fetch(path, body = {}) {
    await this.ensureRunning();
    this.lastActivityAt = Date.now();
    return this._fetch(getDockerHostname(), getWorkspacePort(), path, body);
  }

  /**
   * Get workspace status for dashboard.
   */
  getStatus() {
    return {
      enabled: true,
      status: this.status,
      containerId: this.containerId,
      port: getWorkspacePort(),
      uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      idleSeconds: this.lastActivityAt ? Math.floor((Date.now() - this.lastActivityAt) / 1000) : 0,
    };
  }

  /**
   * Gracefully shutdown the workspace container.
   */
  async shutdown() {
    console.log('[workspace] Shutting down...');
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    try {
      await this._fetch(getDockerHostname(), getWorkspacePort(), '/shutdown', {}).catch(() => {});
    } catch {}
    try {
      execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'ignore', timeout: 15000 });
    } catch {}
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore', timeout: 5000 });
    } catch {}
    this.status = 'stopped';
    this.containerId = null;
    this._startPromise = null;
    console.log('[workspace] Stopped');
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  _fetchHealth(host, port) {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${host}:${port}/health`, { timeout: 5000 }, (res) => {
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

  _fetch(host, port, path, body) {
    const payload = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: host,
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 300_000, // 5 min for long commands
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

// ── Singleton accessors ─────────────────────────────────────────────────────

/**
 * Get the workspace manager singleton. Returns null if not enabled.
 * Uses globalThis to survive Next.js route bundle isolation.
 * @returns {WorkspaceManager|null}
 */
export function getWorkspace() {
  if (!isWorkspaceEnabled()) return null;
  if (!globalThis[GLOBALTHIS_KEY]) {
    globalThis[GLOBALTHIS_KEY] = new WorkspaceManager();
  }
  return globalThis[GLOBALTHIS_KEY];
}

/**
 * Shutdown the workspace if running.
 */
export async function shutdownWorkspace() {
  const ws = globalThis[GLOBALTHIS_KEY];
  if (ws) {
    await ws.shutdown();
    delete globalThis[GLOBALTHIS_KEY];
  }
}
