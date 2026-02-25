import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
const DOCKER_CHECK_TTL_MS = 3e4;
let dockerAvailable = null;
let dockerCheckedAt = 0;
let cachedImage = null;
function checkDockerAvailable() {
  const now = Date.now();
  if (dockerAvailable !== null && now - dockerCheckedAt < DOCKER_CHECK_TTL_MS) {
    return dockerAvailable;
  }
  try {
    execSync("docker info", { stdio: "ignore", timeout: 5e3 });
    dockerAvailable = true;
  } catch {
    dockerAvailable = false;
  }
  dockerCheckedAt = now;
  return dockerAvailable;
}
function getExecutionMode() {
  const mode = (process.env.EXECUTION_MODE || "github").toLowerCase();
  if (mode === "local") return "local";
  if (mode === "auto") return checkDockerAvailable() ? "local" : "github";
  return "github";
}
function isLocalExecutionEnabled() {
  return getExecutionMode() === "local";
}
function getJobDockerImage() {
  if (process.env.JOB_DOCKER_IMAGE) return process.env.JOB_DOCKER_IMAGE;
  if (cachedImage) return cachedImage;
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package-lock.json"), "utf8")
    );
    const version = pkg.packages?.["node_modules/mantis-ai"]?.version;
    if (version) {
      cachedImage = `maitrikpatel2025/mantis-ai:job-${version}`;
      return cachedImage;
    }
  } catch {
  }
  cachedImage = "maitrikpatel2025/mantis-ai:job-latest";
  return cachedImage;
}
function getWarmPoolSize() {
  return parseInt(process.env.WARM_POOL_SIZE || "0", 10);
}
function getWarmPoolMaxJobs() {
  return parseInt(process.env.WARM_POOL_MAX_JOBS || "10", 10);
}
function getWarmPoolMaxLifetime() {
  return parseInt(process.env.WARM_POOL_MAX_LIFETIME || "3600", 10);
}
function getWarmPoolPortStart() {
  return parseInt(process.env.WARM_POOL_PORT_START || "9100", 10);
}
export {
  getExecutionMode,
  getJobDockerImage,
  getWarmPoolMaxJobs,
  getWarmPoolMaxLifetime,
  getWarmPoolPortStart,
  getWarmPoolSize,
  isLocalExecutionEnabled
};
