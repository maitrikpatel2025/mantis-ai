#!/usr/bin/env node
import { createServer } from "http";
import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
const PORT = 8080;
const WORK_DIR = "/job";
let ready = false;
let busy = false;
let jobsRun = 0;
let currentJobId = null;
let currentProcess = null;
let chromePid = null;
const startedAt = Date.now();
function exec(cmd, opts = {}) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 12e4, ...opts }).toString().trim();
}
function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}
function respond(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function log(msg) {
  console.log(`[warm-worker] ${msg}`);
}
async function startup() {
  const repoUrl = process.env.REPO_URL;
  if (!repoUrl) {
    console.error("[warm-worker] REPO_URL not set");
    process.exit(1);
  }
  if (process.env.SECRETS) {
    try {
      const secrets = JSON.parse(process.env.SECRETS);
      for (const [k, v] of Object.entries(secrets)) {
        process.env[k] = v;
      }
    } catch (err) {
      log(`Warning: failed to parse SECRETS: ${err.message}`);
    }
  }
  if (process.env.LLM_SECRETS) {
    try {
      const llmSecrets = JSON.parse(process.env.LLM_SECRETS);
      for (const [k, v] of Object.entries(llmSecrets)) {
        process.env[k] = v;
      }
    } catch (err) {
      log(`Warning: failed to parse LLM_SECRETS: ${err.message}`);
    }
  }
  log("Setting up git identity...");
  exec("gh auth setup-git");
  const userJson = exec("gh api user -q '{name: .name, login: .login, email: .email, id: .id}'");
  const user = JSON.parse(userJson);
  const name = user.name || user.login || "mantis";
  const email = user.email || `${user.id}+${user.login}@users.noreply.github.com`;
  exec(`git config --global user.name "${name}"`);
  exec(`git config --global user.email "${email}"`);
  log("Cloning repository...");
  exec(`git clone --depth 50 "${repoUrl}" ${WORK_DIR}`, { timeout: 3e5 });
  log("Installing skill dependencies...");
  const skillsDir = join(WORK_DIR, ".pi", "skills");
  if (existsSync(skillsDir)) {
    for (const skill of readdirSync(skillsDir)) {
      const pkgPath = join(skillsDir, skill, "package.json");
      if (existsSync(pkgPath)) {
        log(`  Installing: ${skill}`);
        try {
          exec("npm install --omit=dev --no-package-lock", {
            cwd: join(skillsDir, skill),
            timeout: 12e4
          });
        } catch (err) {
          log(`  Warning: failed to install ${skill}: ${err.message}`);
        }
      }
    }
  }
  mkdirSync(join(WORK_DIR, "tmp"), { recursive: true });
  try {
    const chromeBin = exec('find /root/.cache/puppeteer -name "chrome" -type f 2>/dev/null | head -1');
    if (chromeBin) {
      log("Starting headless Chrome...");
      const chrome = spawn(chromeBin, [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--remote-debugging-port=9222"
      ], { stdio: "ignore", detached: true });
      chrome.unref();
      chromePid = chrome.pid ?? null;
      await new Promise((r) => setTimeout(r, 2e3));
    }
  } catch {
    log("Chrome not available, skipping");
  }
  const llmProvider = process.env.LLM_PROVIDER || "anthropic";
  if (llmProvider === "custom" && process.env.OPENAI_BASE_URL) {
    if (!process.env.CUSTOM_API_KEY) process.env.CUSTOM_API_KEY = "not-needed";
    const modelsDir = "/root/.pi/agent";
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, "models.json"), JSON.stringify({
      providers: {
        custom: {
          baseUrl: process.env.OPENAI_BASE_URL,
          api: "openai-completions",
          apiKey: "CUSTOM_API_KEY",
          models: [{ id: process.env.LLM_MODEL || "default" }]
        }
      }
    }, null, 2));
  }
  const repoModels = join(WORK_DIR, ".pi", "agent", "models.json");
  if (existsSync(repoModels)) {
    const dest = "/root/.pi/agent";
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "models.json"), readFileSync(repoModels));
  }
  ready = true;
  log("Ready for jobs");
}
async function runJob(jobId, branch) {
  busy = true;
  currentJobId = jobId;
  try {
    log(`Fetching branch ${branch}...`);
    exec(`git fetch origin ${branch}:${branch}`, { cwd: WORK_DIR, timeout: 6e4 });
    exec(`git checkout ${branch}`, { cwd: WORK_DIR });
    const logDir = join(WORK_DIR, "logs", jobId);
    mkdirSync(logDir, { recursive: true });
    const soulPath = join(WORK_DIR, "config", "SOUL.md");
    const agentPath = join(WORK_DIR, "config", "AGENT.md");
    const systemPath = join(WORK_DIR, ".pi", "SYSTEM.md");
    let systemContent = "";
    if (existsSync(soulPath)) systemContent += readFileSync(soulPath, "utf8");
    if (existsSync(agentPath)) {
      if (systemContent) systemContent += "\n\n";
      systemContent += readFileSync(agentPath, "utf8");
    }
    systemContent = systemContent.replace(/\{\{datetime\}\}/g, (/* @__PURE__ */ new Date()).toISOString());
    writeFileSync(systemPath, systemContent);
    const jobMdPath = join(logDir, "job.md");
    const jobPrompt = existsSync(jobMdPath) ? readFileSync(jobMdPath, "utf8") : "";
    const prompt = `

# Your Job

${jobPrompt}`;
    const llmProvider = process.env.LLM_PROVIDER || "anthropic";
    let modelFlags = `--provider ${llmProvider}`;
    if (process.env.LLM_MODEL) modelFlags += ` --model ${process.env.LLM_MODEL}`;
    log(`Running Pi agent for job ${jobId}...`);
    const exitCode = await new Promise((resolve) => {
      const child = spawn("pi", [...modelFlags.split(" "), "-p", prompt, "--session-dir", logDir], {
        cwd: WORK_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env
      });
      currentProcess = child;
      child.stdout?.on("data", (d) => process.stdout.write(d));
      child.stderr?.on("data", (d) => process.stderr.write(d));
      child.on("close", (code) => {
        currentProcess = null;
        resolve(code || 0);
      });
      child.on("error", (err) => {
        currentProcess = null;
        log(`Pi spawn error: ${err.message}`);
        resolve(1);
      });
    });
    if (exitCode !== 0) {
      throw new Error(`Pi exited with code ${exitCode}`);
    }
    log("Committing results...");
    try {
      exec("git add -A", { cwd: WORK_DIR });
      exec(`git add -f "${logDir}"`, { cwd: WORK_DIR });
      exec(`git commit -m "mantis-ai: job ${jobId}"`, { cwd: WORK_DIR });
      exec("git push origin", { cwd: WORK_DIR, timeout: 6e4 });
    } catch (err) {
      log(`Git commit/push warning: ${err.message}`);
    }
    log("Creating PR...");
    try {
      exec(`gh pr create --title "mantis-ai: job ${jobId}" --body "Automated job" --base main`, {
        cwd: WORK_DIR,
        timeout: 3e4
      });
    } catch (err) {
      log(`PR creation warning: ${err.message}`);
    }
    jobsRun++;
    return { status: "completed" };
  } catch (err) {
    jobsRun++;
    return { status: "failed", error: err.message };
  } finally {
    resetWorkspace();
    busy = false;
    currentJobId = null;
  }
}
function resetWorkspace() {
  try {
    const currentBranch = exec("git rev-parse --abbrev-ref HEAD", { cwd: WORK_DIR });
    if (currentBranch !== "main") {
      exec("git checkout main", { cwd: WORK_DIR });
      exec(`git branch -D ${currentBranch}`, { cwd: WORK_DIR });
    }
    exec("git clean -fd", { cwd: WORK_DIR });
    exec("git reset --hard origin/main", { cwd: WORK_DIR });
  } catch (err) {
    log(`Reset warning: ${err.message}`);
  }
}
function cancelCurrentJob() {
  if (!currentProcess) return false;
  log(`Cancelling job ${currentJobId}...`);
  try {
    currentProcess.kill("SIGTERM");
    const pid = currentProcess.pid;
    if (pid !== void 0) {
      setTimeout(() => {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
        }
      }, 5e3);
    }
  } catch {
  }
  return true;
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return respond(res, 200, {
      ready,
      busy,
      jobsRun,
      currentJobId,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1e3)
    });
  }
  if (req.method === "POST" && url.pathname === "/run") {
    if (!ready) return respond(res, 503, { error: "Not ready" });
    if (busy) return respond(res, 409, { error: "Busy", currentJobId });
    const body = await parseJsonBody(req);
    const { jobId, branch } = body;
    if (!jobId || !branch) return respond(res, 400, { error: "jobId and branch required" });
    log(`Received job: ${jobId} (branch: ${branch})`);
    const result = await runJob(jobId, branch);
    return respond(res, result.status === "completed" ? 200 : 500, result);
  }
  if (req.method === "POST" && url.pathname === "/cancel") {
    const cancelled = cancelCurrentJob();
    return respond(res, 200, { cancelled, currentJobId });
  }
  if (req.method === "POST" && url.pathname === "/shutdown") {
    log("Shutdown requested");
    respond(res, 200, { status: "shutting_down" });
    if (chromePid) {
      try {
        process.kill(chromePid);
      } catch {
      }
    }
    cancelCurrentJob();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5e3);
    return;
  }
  respond(res, 404, { error: "Not found" });
});
server.listen(PORT, () => {
  log(`HTTP server listening on port ${PORT}`);
});
startup().catch((err) => {
  console.error("[warm-worker] Startup failed:", err);
  process.exit(1);
});
process.on("SIGTERM", () => {
  log("SIGTERM received");
  if (chromePid) {
    try {
      process.kill(chromePid);
    } catch {
    }
  }
  cancelCurrentJob();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5e3);
});
