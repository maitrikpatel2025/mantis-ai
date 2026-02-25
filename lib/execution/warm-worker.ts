#!/usr/bin/env node

/**
 * Warm Worker -- Node.js HTTP server that runs INSIDE a Docker container.
 * Mounted via -v and started with --entrypoint node.
 *
 * Uses only Node built-ins (http, child_process, fs, path) -- no npm deps.
 *
 * Startup: parse secrets, git clone, install skill deps, start Chrome, listen on :8080.
 * Endpoints:
 *   GET  /health   -> { ready, busy, jobsRun, currentJobId, uptimeSeconds }
 *   POST /run      -> { jobId, branch } -> run Pi agent, commit, PR -> { status, error? }
 *   POST /cancel   -> kill current Pi process, reset workspace, stay alive
 *   POST /shutdown -> graceful exit
 */

import { createServer } from 'http';
import type { IncomingMessage, ServerResponse, Server } from 'http';
import { execSync, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const PORT: number = 8080;
const WORK_DIR: string = '/job';

let ready: boolean = false;
let busy: boolean = false;
let jobsRun: number = 0;
let currentJobId: string | null = null;
let currentProcess: ChildProcess | null = null;
let chromePid: number | null = null;
const startedAt: number = Date.now();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunRequestBody {
  jobId?: string;
  branch?: string;
}

interface JobResult {
  status: 'completed' | 'failed';
  error?: string;
}

interface HealthResponse {
  ready: boolean;
  busy: boolean;
  jobsRun: number;
  currentJobId: string | null;
  uptimeSeconds: number;
}

interface ExecOptions {
  stdio?: Array<'ignore' | 'pipe'>;
  timeout?: number;
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exec(cmd: string, opts: ExecOptions = {}): string {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, ...opts }).toString().trim();
}

function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c: Buffer | string) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function respond(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function log(msg: string): void {
  console.log(`[warm-worker] ${msg}`);
}

// ---------------------------------------------------------------------------
// Startup sequence (mirrors entrypoint.sh lines 12-59)
// ---------------------------------------------------------------------------

async function startup(): Promise<void> {
  const repoUrl: string | undefined = process.env.REPO_URL;
  if (!repoUrl) {
    console.error('[warm-worker] REPO_URL not set');
    process.exit(1);
  }

  // 1. Export SECRETS JSON as flat env vars
  if (process.env.SECRETS) {
    try {
      const secrets: Record<string, string> = JSON.parse(process.env.SECRETS);
      for (const [k, v] of Object.entries(secrets)) {
        process.env[k] = v;
      }
    } catch (err) {
      log(`Warning: failed to parse SECRETS: ${(err as Error).message}`);
    }
  }

  // 2. Export LLM_SECRETS
  if (process.env.LLM_SECRETS) {
    try {
      const llmSecrets: Record<string, string> = JSON.parse(process.env.LLM_SECRETS);
      for (const [k, v] of Object.entries(llmSecrets)) {
        process.env[k] = v;
      }
    } catch (err) {
      log(`Warning: failed to parse LLM_SECRETS: ${(err as Error).message}`);
    }
  }

  // 3. Git identity from GitHub token
  log('Setting up git identity...');
  exec('gh auth setup-git');
  const userJson: string = exec("gh api user -q '{name: .name, login: .login, email: .email, id: .id}'");
  const user: { name?: string; login?: string; email?: string; id?: number } = JSON.parse(userJson);
  const name: string = user.name || user.login || 'mantis';
  const email: string = user.email || `${user.id}+${user.login}@users.noreply.github.com`;
  exec(`git config --global user.name "${name}"`);
  exec(`git config --global user.email "${email}"`);

  // 4. Clone repo (depth 50 so we can fetch job branches)
  log('Cloning repository...');
  exec(`git clone --depth 50 "${repoUrl}" ${WORK_DIR}`, { timeout: 300_000 });

  // 5. Install skill deps
  log('Installing skill dependencies...');
  const skillsDir: string = join(WORK_DIR, '.pi', 'skills');
  if (existsSync(skillsDir)) {
    for (const skill of readdirSync(skillsDir)) {
      const pkgPath: string = join(skillsDir, skill, 'package.json');
      if (existsSync(pkgPath)) {
        log(`  Installing: ${skill}`);
        try {
          exec('npm install --omit=dev --no-package-lock', {
            cwd: join(skillsDir, skill),
            timeout: 120_000,
          });
        } catch (err) {
          log(`  Warning: failed to install ${skill}: ${(err as Error).message}`);
        }
      }
    }
  }

  // 6. Create tmp directory
  mkdirSync(join(WORK_DIR, 'tmp'), { recursive: true });

  // 7. Start headless Chrome if available
  try {
    const chromeBin: string = exec('find /root/.cache/puppeteer -name "chrome" -type f 2>/dev/null | head -1');
    if (chromeBin) {
      log('Starting headless Chrome...');
      const chrome: ChildProcess = spawn(chromeBin, [
        '--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9222',
      ], { stdio: 'ignore', detached: true });
      chrome.unref();
      chromePid = chrome.pid ?? null;
      // Give Chrome a moment to start
      await new Promise<void>((r) => setTimeout(r, 2000));
    }
  } catch {
    log('Chrome not available, skipping');
  }

  // 8. Setup custom provider models.json if needed
  const llmProvider: string = process.env.LLM_PROVIDER || 'anthropic';
  if (llmProvider === 'custom' && process.env.OPENAI_BASE_URL) {
    if (!process.env.CUSTOM_API_KEY) process.env.CUSTOM_API_KEY = 'not-needed';
    const modelsDir: string = '/root/.pi/agent';
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'models.json'), JSON.stringify({
      providers: {
        custom: {
          baseUrl: process.env.OPENAI_BASE_URL,
          api: 'openai-completions',
          apiKey: 'CUSTOM_API_KEY',
          models: [{ id: process.env.LLM_MODEL || 'default' }],
        },
      },
    }, null, 2));
  }

  // Copy repo-level custom models.json if present
  const repoModels: string = join(WORK_DIR, '.pi', 'agent', 'models.json');
  if (existsSync(repoModels)) {
    const dest: string = '/root/.pi/agent';
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'models.json'), readFileSync(repoModels));
  }

  ready = true;
  log('Ready for jobs');
}

// ---------------------------------------------------------------------------
// Job execution (mirrors entrypoint.sh lines 60-138)
// ---------------------------------------------------------------------------

async function runJob(jobId: string, branch: string): Promise<JobResult> {
  busy = true;
  currentJobId = jobId;

  try {
    // 1. Fetch and checkout the job branch
    log(`Fetching branch ${branch}...`);
    exec(`git fetch origin ${branch}:${branch}`, { cwd: WORK_DIR, timeout: 60_000 });
    exec(`git checkout ${branch}`, { cwd: WORK_DIR });

    // 2. Create log directory
    const logDir: string = join(WORK_DIR, 'logs', jobId);
    mkdirSync(logDir, { recursive: true });

    // 3. Build SYSTEM.md from config files
    const soulPath: string = join(WORK_DIR, 'config', 'SOUL.md');
    const agentPath: string = join(WORK_DIR, 'config', 'AGENT.md');
    const systemPath: string = join(WORK_DIR, '.pi', 'SYSTEM.md');

    let systemContent: string = '';
    if (existsSync(soulPath)) systemContent += readFileSync(soulPath, 'utf8');
    if (existsSync(agentPath)) {
      if (systemContent) systemContent += '\n\n';
      systemContent += readFileSync(agentPath, 'utf8');
    }
    // Replace {{datetime}} variable
    systemContent = systemContent.replace(/\{\{datetime\}\}/g, new Date().toISOString());
    writeFileSync(systemPath, systemContent);

    // 4. Read job prompt
    const jobMdPath: string = join(logDir, 'job.md');
    const jobPrompt: string = existsSync(jobMdPath) ? readFileSync(jobMdPath, 'utf8') : '';
    const prompt: string = `\n\n# Your Job\n\n${jobPrompt}`;

    // 5. Build model flags
    const llmProvider: string = process.env.LLM_PROVIDER || 'anthropic';
    let modelFlags: string = `--provider ${llmProvider}`;
    if (process.env.LLM_MODEL) modelFlags += ` --model ${process.env.LLM_MODEL}`;

    // 6. Run Pi agent
    log(`Running Pi agent for job ${jobId}...`);
    const exitCode: number = await new Promise<number>((resolve) => {
      const child: ChildProcess = spawn('pi', [...modelFlags.split(' '), '-p', prompt, '--session-dir', logDir], {
        cwd: WORK_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });
      currentProcess = child;

      child.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
      child.stderr?.on('data', (d: Buffer) => process.stderr.write(d));

      child.on('close', (code: number | null) => {
        currentProcess = null;
        resolve(code || 0);
      });

      child.on('error', (err: Error) => {
        currentProcess = null;
        log(`Pi spawn error: ${err.message}`);
        resolve(1);
      });
    });

    if (exitCode !== 0) {
      throw new Error(`Pi exited with code ${exitCode}`);
    }

    // 7. Commit and push
    log('Committing results...');
    try {
      exec('git add -A', { cwd: WORK_DIR });
      exec(`git add -f "${logDir}"`, { cwd: WORK_DIR });
      exec(`git commit -m "mantis-ai: job ${jobId}"`, { cwd: WORK_DIR });
      exec('git push origin', { cwd: WORK_DIR, timeout: 60_000 });
    } catch (err) {
      log(`Git commit/push warning: ${(err as Error).message}`);
    }

    // 8. Create PR
    log('Creating PR...');
    try {
      exec(`gh pr create --title "mantis-ai: job ${jobId}" --body "Automated job" --base main`, {
        cwd: WORK_DIR,
        timeout: 30_000,
      });
    } catch (err) {
      log(`PR creation warning: ${(err as Error).message}`);
    }

    jobsRun++;
    return { status: 'completed' };
  } catch (err) {
    jobsRun++;
    return { status: 'failed', error: (err as Error).message };
  } finally {
    // 9. Reset workspace for next job
    resetWorkspace();
    busy = false;
    currentJobId = null;
  }
}

function resetWorkspace(): void {
  try {
    const currentBranch: string = exec('git rev-parse --abbrev-ref HEAD', { cwd: WORK_DIR });
    if (currentBranch !== 'main') {
      exec('git checkout main', { cwd: WORK_DIR });
      exec(`git branch -D ${currentBranch}`, { cwd: WORK_DIR });
    }
    exec('git clean -fd', { cwd: WORK_DIR });
    exec('git reset --hard origin/main', { cwd: WORK_DIR });
  } catch (err) {
    log(`Reset warning: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Cancel handler
// ---------------------------------------------------------------------------

function cancelCurrentJob(): boolean {
  if (!currentProcess) return false;

  log(`Cancelling job ${currentJobId}...`);
  try {
    currentProcess.kill('SIGTERM');
    // Force kill after 5s if still alive
    const pid: number | undefined = currentProcess.pid;
    if (pid !== undefined) {
      setTimeout(() => {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }, 5000);
    }
  } catch {}

  return true;
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return respond(res, 200, {
      ready,
      busy,
      jobsRun,
      currentJobId,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    } satisfies HealthResponse);
  }

  if (req.method === 'POST' && url.pathname === '/run') {
    if (!ready) return respond(res, 503, { error: 'Not ready' });
    if (busy) return respond(res, 409, { error: 'Busy', currentJobId });

    const body = await parseJsonBody(req) as RunRequestBody;
    const { jobId, branch } = body;
    if (!jobId || !branch) return respond(res, 400, { error: 'jobId and branch required' });

    log(`Received job: ${jobId} (branch: ${branch})`);
    const result: JobResult = await runJob(jobId, branch);
    return respond(res, result.status === 'completed' ? 200 : 500, result);
  }

  if (req.method === 'POST' && url.pathname === '/cancel') {
    const cancelled: boolean = cancelCurrentJob();
    return respond(res, 200, { cancelled, currentJobId });
  }

  if (req.method === 'POST' && url.pathname === '/shutdown') {
    log('Shutdown requested');
    respond(res, 200, { status: 'shutting_down' });

    // Kill Chrome
    if (chromePid) {
      try { process.kill(chromePid); } catch {}
    }

    // Kill any running Pi process
    cancelCurrentJob();

    // Close server and exit
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000);
    return;
  }

  respond(res, 404, { error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  log(`HTTP server listening on port ${PORT}`);
});

startup().catch((err: unknown) => {
  console.error('[warm-worker] Startup failed:', err);
  process.exit(1);
});

// Graceful shutdown on signals
process.on('SIGTERM', () => {
  log('SIGTERM received');
  if (chromePid) { try { process.kill(chromePid); } catch {} }
  cancelCurrentJob();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
});
