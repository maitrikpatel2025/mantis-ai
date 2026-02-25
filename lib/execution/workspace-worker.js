#!/usr/bin/env node
import { createServer } from "http";
import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
const PORT = 8080;
const WORKSPACE_DIR = "/workspace";
const IDLE_TIMEOUT_S = parseInt(process.env.IDLE_TIMEOUT || "1800", 10);
const MAX_OUTPUT = 1e5;
const MAX_FILE_READ = 5e5;
let ready = false;
let idleTimer = null;
const startedAt = Date.now();
function parseJsonBody(req) {
  return new Promise((resolvePromise) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      try {
        resolvePromise(JSON.parse(body));
      } catch {
        resolvePromise({});
      }
    });
  });
}
function respond(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function log(msg) {
  console.log(`[workspace] ${msg}`);
}
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    log(`Idle timeout (${IDLE_TIMEOUT_S}s) reached, shutting down`);
    process.exit(0);
  }, IDLE_TIMEOUT_S * 1e3);
}
async function startup() {
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
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  try {
    const { execSync } = await import("child_process");
    const chromeBin = execSync('find /root/.cache/puppeteer -name "chrome" -type f 2>/dev/null | head -1', {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1e4
    }).toString().trim();
    if (chromeBin) {
      log("Starting headless Chrome...");
      const chrome = spawn(chromeBin, [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--remote-debugging-port=9222"
      ], { stdio: "ignore", detached: true });
      chrome.unref();
      await new Promise((r) => setTimeout(r, 2e3));
    }
  } catch {
    log("Chrome not available, skipping");
  }
  ready = true;
  resetIdleTimer();
  log("Ready");
}
function handleExec(body) {
  resetIdleTimer();
  const { command, cwd, timeout } = body;
  if (!command) return Promise.resolve({ exitCode: 1, stdout: "", stderr: "No command provided" });
  const execCwd = cwd ? resolve(WORKSPACE_DIR, cwd) : WORKSPACE_DIR;
  const execTimeout = Math.min(timeout || 3e5, 6e5);
  return new Promise((res) => {
    let stdout = "";
    let stderr = "";
    let killed = false;
    const child = spawn("bash", ["-c", command], {
      cwd: execCwd,
      env: process.env
    });
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
        }
      }, 5e3);
    }, execTimeout);
    child.stdout?.on("data", (d) => {
      const chunk = d.toString();
      if (stdout.length < MAX_OUTPUT) stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", (d) => {
      const chunk = d.toString();
      if (stderr.length < MAX_OUTPUT) stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) stderr += "\n[timeout: command killed]";
      res({ exitCode: code || 0, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      res({ exitCode: 1, stdout: "", stderr: err.message });
    });
  });
}
function handleReadFile(body) {
  resetIdleTimer();
  const { path: filePath } = body;
  if (!filePath) return { error: "No path provided" };
  const resolved = resolve(WORKSPACE_DIR, filePath);
  if (!resolved.startsWith(WORKSPACE_DIR)) {
    return { error: "Path outside workspace" };
  }
  if (!existsSync(resolved)) {
    return { error: `File not found: ${filePath}` };
  }
  try {
    const stat = statSync(resolved);
    if (stat.isDirectory()) {
      return { error: `Path is a directory: ${filePath}` };
    }
    const content = readFileSync(resolved, "utf8");
    return {
      content: content.length > MAX_FILE_READ ? content.slice(0, MAX_FILE_READ) + "\n[truncated]" : content,
      size: stat.size
    };
  } catch (err) {
    return { error: err.message };
  }
}
function handleWriteFile(body) {
  resetIdleTimer();
  const { path: filePath, content } = body;
  if (!filePath) return { error: "No path provided" };
  if (content === void 0 || content === null) return { error: "No content provided" };
  const resolved = resolve(WORKSPACE_DIR, filePath);
  if (!resolved.startsWith(WORKSPACE_DIR)) {
    return { error: "Path outside workspace" };
  }
  try {
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, content);
    return { success: true, path: filePath };
  } catch (err) {
    return { error: err.message };
  }
}
function handleInstall(body) {
  resetIdleTimer();
  const { packages, type } = body;
  if (!packages || !packages.length) {
    return Promise.resolve({ exitCode: 1, stdout: "", stderr: "No packages provided" });
  }
  const pkgList = packages.join(" ");
  let command;
  if (type === "apt") {
    command = `apt-get update -qq && apt-get install -y -qq ${pkgList}`;
  } else {
    command = `cd ${WORKSPACE_DIR} && npm install ${pkgList}`;
  }
  return handleExec({ command, timeout: 12e4 });
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return respond(res, 200, {
      ready,
      uptime: Math.floor((Date.now() - startedAt) / 1e3),
      cwd: WORKSPACE_DIR
    });
  }
  if (req.method === "POST" && url.pathname === "/exec") {
    if (!ready) return respond(res, 503, { error: "Not ready" });
    const body = await parseJsonBody(req);
    const result = await handleExec(body);
    return respond(res, 200, result);
  }
  if (req.method === "POST" && url.pathname === "/read-file") {
    if (!ready) return respond(res, 503, { error: "Not ready" });
    const body = await parseJsonBody(req);
    const result = handleReadFile(body);
    return respond(res, result.error ? 400 : 200, result);
  }
  if (req.method === "POST" && url.pathname === "/write-file") {
    if (!ready) return respond(res, 503, { error: "Not ready" });
    const body = await parseJsonBody(req);
    const result = handleWriteFile(body);
    return respond(res, result.error ? 400 : 200, result);
  }
  if (req.method === "POST" && url.pathname === "/install") {
    if (!ready) return respond(res, 503, { error: "Not ready" });
    const body = await parseJsonBody(req);
    const result = await handleInstall(body);
    return respond(res, 200, result);
  }
  if (req.method === "POST" && url.pathname === "/shutdown") {
    log("Shutdown requested");
    respond(res, 200, { status: "shutting_down" });
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
  console.error("[workspace] Startup failed:", err);
  process.exit(1);
});
process.on("SIGTERM", () => {
  log("SIGTERM received");
  if (idleTimer) clearTimeout(idleTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5e3);
});
