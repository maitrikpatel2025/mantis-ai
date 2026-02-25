// @ts-expect-error -- node-cron has no type declarations
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { cronsFile, cronDir } from './paths.js';
import { executeAction } from './actions.js';
import type { CronJobConfig, ActionConfig } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduledCronTask {
  name: string;
  schedule: string;
  type: string;
  task: { stop: () => void };
}

// ---------------------------------------------------------------------------
// Version check
// ---------------------------------------------------------------------------

function getInstalledVersion(): string {
  const pkgPath: string = path.join(process.cwd(), 'node_modules', 'mantis-ai', 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
}

// In-memory flag for available update (read by sidebar, written by cron)
let _updateAvailable: string | null = null;

/**
 * Get the in-memory update-available version (or null).
 */
function getUpdateAvailable(): string | null {
  return _updateAvailable;
}

/**
 * Set the in-memory update-available version.
 */
function setUpdateAvailable(v: string | null): void {
  _updateAvailable = v;
}

/**
 * Compare two semver strings numerically.
 * @param candidate - e.g. "1.2.40"
 * @param baseline  - e.g. "1.2.39"
 * @returns true if candidate > baseline
 */
function isVersionNewer(candidate: string, baseline: string): boolean {
  // Pre-release candidate is never "newer" for upgrade purposes
  if (candidate.includes('-')) return false;

  const a: number[] = candidate.split('.').map(Number);
  const b: number[] = baseline.replace(/-.*$/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av: number = a[i] || 0;
    const bv: number = b[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

/**
 * Check npm registry for a newer version of mantis-ai.
 */
async function runVersionCheck(): Promise<void> {
  try {
    const res: Response = await fetch('https://registry.npmjs.org/mantis-ai/latest');
    if (!res.ok) {
      console.warn(`[version check] npm registry returned ${res.status}`);
      return;
    }
    const data: { version: string } = await res.json();
    const latest: string = data.version;

    const installed: string = getInstalledVersion();
    if (isVersionNewer(latest, installed)) {
      console.log(`[version check] update available: ${installed} → ${latest}`);
      setUpdateAvailable(latest);
      // Persist to DB
      const { setAvailableVersion } = await import('./db/update-check.js');
      setAvailableVersion(latest);
    } else {
      setUpdateAvailable(null);
      // Clear DB
      const { clearAvailableVersion } = await import('./db/update-check.js');
      clearAvailableVersion();
    }
  } catch (err) {
    console.warn(`[version check] failed: ${(err as Error).message}`);
    // Leave existing flag untouched on error
  }
}

/**
 * Start built-in crons (version check). Called from instrumentation.
 */
function startBuiltinCrons(): void {
  // Schedule hourly
  cron.schedule('0 * * * *', runVersionCheck);
  // Run once immediately
  runVersionCheck();
}

// ---------------------------------------------------------------------------
// Cron loading
// ---------------------------------------------------------------------------

let _tasks: ScheduledCronTask[] = [];

/**
 * Load and schedule crons from CRONS.json
 */
function loadCrons(): ScheduledCronTask[] {
  const cronFile: string = cronsFile;

  console.log('\n--- Cron Jobs ---');

  if (!fs.existsSync(cronFile)) {
    console.log('No CRONS.json found');
    console.log('-----------------\n');
    return [];
  }

  const crons: CronJobConfig[] = JSON.parse(fs.readFileSync(cronFile, 'utf8'));
  const tasks: ScheduledCronTask[] = [];

  for (const cronEntry of crons) {
    const { name, schedule, type = 'agent', enabled } = cronEntry;
    if (enabled === false) continue;

    if (!cron.validate(schedule)) {
      console.error(`Invalid schedule for "${name}": ${schedule}`);
      continue;
    }

    const task = cron.schedule(schedule, async () => {
      const startedAt: number = Date.now();
      try {
        const result: string | undefined = await executeAction(cronEntry as unknown as ActionConfig & Record<string, unknown>, { cwd: cronDir, source: 'cron' });
        const output: string = result ? String(result) : 'ran';
        console.log(`[CRON] ${name}: ${output}`);
        console.log(`[CRON] ${name}: completed!`);
        try {
          const { insertCronRun } = await import('./db/cron-runs.js');
          insertCronRun({
            cronName: name,
            status: 'success',
            startedAt,
            completedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            output,
          });
        } catch {}
      } catch (err) {
        console.error(`[CRON] ${name}: error - ${(err as Error).message}`);
        try {
          const { insertCronRun } = await import('./db/cron-runs.js');
          insertCronRun({
            cronName: name,
            status: 'error',
            startedAt,
            completedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            error: (err as Error).message,
          });
        } catch {}
      }
    });

    tasks.push({ name, schedule, type, task });
  }

  if (tasks.length === 0) {
    console.log('No active cron jobs');
  } else {
    for (const { name, schedule, type } of tasks) {
      console.log(`  ${name}: ${schedule} (${type})`);
    }
  }

  console.log('-----------------\n');

  _tasks = tasks;
  return tasks;
}

/**
 * Stop all scheduled cron tasks.
 */
function stopCrons(): void {
  for (const { task } of _tasks) {
    try { task.stop(); } catch {}
  }
  _tasks = [];
}

/**
 * Reload crons: stop all existing and re-load from CRONS.json.
 */
function reloadCrons(): void {
  stopCrons();
  loadCrons();
}

/**
 * Validate a cron schedule expression.
 */
function validateSchedule(schedule: string): boolean {
  return cron.validate(schedule);
}

export { loadCrons, stopCrons, reloadCrons, validateSchedule, startBuiltinCrons, getUpdateAvailable, setUpdateAvailable, getInstalledVersion };
