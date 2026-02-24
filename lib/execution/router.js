import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DOCKER_CHECK_TTL_MS = 30_000; // Re-check Docker every 30s

let dockerAvailable = null;
let dockerCheckedAt = 0;
let cachedImage = null;

/**
 * Check if Docker is available on this machine.
 * Cached with TTL — re-checks periodically so recovery is detected.
 * @returns {boolean}
 */
function checkDockerAvailable() {
  const now = Date.now();
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
 * - 'github' — always GitHub Actions
 * - 'local'  — always local Docker
 * - 'auto'   — local when Docker is available, GitHub Actions fallback
 * @returns {'github' | 'local'}
 */
export function getExecutionMode() {
  const mode = (process.env.EXECUTION_MODE || 'github').toLowerCase();
  if (mode === 'local') return 'local';
  if (mode === 'auto') return checkDockerAvailable() ? 'local' : 'github';
  return 'github';
}

/**
 * Check if local execution is enabled.
 * @returns {boolean}
 */
export function isLocalExecutionEnabled() {
  return getExecutionMode() === 'local';
}

/**
 * Get the Docker image to use for local job execution.
 * Result is cached (image version doesn't change during runtime).
 * @returns {string}
 */
export function getJobDockerImage() {
  if (process.env.JOB_DOCKER_IMAGE) return process.env.JOB_DOCKER_IMAGE;
  if (cachedImage) return cachedImage;

  try {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'));
    const version = pkg.packages?.['node_modules/mantis-ai']?.version;
    if (version) {
      cachedImage = `maitrikpatel2025/mantis-ai:job-${version}`;
      return cachedImage;
    }
  } catch {}

  cachedImage = 'maitrikpatel2025/mantis-ai:job-latest';
  return cachedImage;
}
