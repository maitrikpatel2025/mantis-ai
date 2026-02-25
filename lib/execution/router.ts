import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DOCKER_CHECK_TTL_MS: number = 30_000; // Re-check Docker every 30s

let dockerAvailable: boolean | null = null;
let dockerCheckedAt: number = 0;
let cachedImage: string | null = null;

/**
 * Check if Docker is available on this machine.
 * Cached with TTL -- re-checks periodically so recovery is detected.
 */
function checkDockerAvailable(): boolean {
  const now: number = Date.now();
  if (dockerAvailable !== null && (now - dockerCheckedAt) < DOCKER_CHECK_TTL_MS) {
    return dockerAvailable;
  }
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    dockerAvailable = true;
  } catch {
    dockerAvailable = false;
  }
  dockerCheckedAt = now;
  return dockerAvailable;
}

/**
 * Get the resolved execution mode for jobs.
 * Reads EXECUTION_MODE env var: 'github' (default) | 'local' | 'auto'
 * - 'github' -- always GitHub Actions
 * - 'local'  -- always local Docker
 * - 'auto'   -- local when Docker is available, GitHub Actions fallback
 */
export function getExecutionMode(): 'github' | 'local' {
  const mode: string = (process.env.EXECUTION_MODE || 'github').toLowerCase();
  if (mode === 'local') return 'local';
  if (mode === 'auto') return checkDockerAvailable() ? 'local' : 'github';
  return 'github';
}

/**
 * Check if local execution is enabled.
 */
export function isLocalExecutionEnabled(): boolean {
  return getExecutionMode() === 'local';
}

/**
 * Get the Docker image to use for local job execution.
 * Result is cached (image version doesn't change during runtime).
 */
export function getJobDockerImage(): string {
  if (process.env.JOB_DOCKER_IMAGE) return process.env.JOB_DOCKER_IMAGE;
  if (cachedImage) return cachedImage;

  try {
    const pkg: { packages?: Record<string, { version?: string }> } = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'),
    );
    const version: string | undefined = pkg.packages?.['node_modules/mantis-ai']?.version;
    if (version) {
      cachedImage = `maitrikpatel2025/mantis-ai:job-${version}`;
      return cachedImage;
    }
  } catch {}

  cachedImage = 'maitrikpatel2025/mantis-ai:job-latest';
  return cachedImage;
}

/**
 * Get the configured warm pool size (number of pre-spawned containers).
 * 0 = disabled (default).
 */
export function getWarmPoolSize(): number {
  return parseInt(process.env.WARM_POOL_SIZE || '0', 10);
}

/**
 * Max jobs a warm container can run before being recycled.
 */
export function getWarmPoolMaxJobs(): number {
  return parseInt(process.env.WARM_POOL_MAX_JOBS || '10', 10);
}

/**
 * Max lifetime (seconds) for a warm container before recycling.
 */
export function getWarmPoolMaxLifetime(): number {
  return parseInt(process.env.WARM_POOL_MAX_LIFETIME || '3600', 10);
}

/**
 * Starting host port for warm worker HTTP servers.
 * Workers use ports portStart, portStart+1, ..., portStart+(size-1).
 */
export function getWarmPoolPortStart(): number {
  return parseInt(process.env.WARM_POOL_PORT_START || '9100', 10);
}
