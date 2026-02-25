import { exec } from 'child_process';
import { promisify } from 'util';
import { createJob } from './tools/create-job.js';
import type { ActionConfig, ActionExecuteOptions } from './types.js';

const execAsync = promisify(exec);

/**
 * Execute a single action
 */
async function executeAction(action: ActionConfig & Record<string, unknown>, opts: ActionExecuteOptions = {}): Promise<string> {
  const type = action.type || 'agent';

  if (type === 'command') {
    const { stdout, stderr } = await execAsync(action.command as string, { cwd: opts.cwd });
    return (stdout || stderr || '').trim();
  }

  if (type === 'webhook') {
    const method = ((action.method as string) || 'POST').toUpperCase();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((action.headers as Record<string, string>) || {}) };
    const fetchOpts: RequestInit = { method, headers };

    if (method !== 'GET') {
      const body: Record<string, unknown> = { ...((action.vars as Record<string, unknown>) || {}) };
      if (opts.data) body.data = opts.data;
      fetchOpts.body = JSON.stringify(body);
    }

    const res = await fetch(action.url as string, fetchOpts);
    return `${method} ${action.url} → ${res.status}`;
  }

  // Default: agent
  const result = await createJob(action.job as string, { source: opts.source || 'unknown' });
  return `job ${result.job_id}`;
}

export { executeAction };
