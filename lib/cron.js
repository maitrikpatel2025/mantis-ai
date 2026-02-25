import cron from "node-cron";
import fs from "fs";
import path from "path";
import { cronsFile, cronDir } from "./paths.js";
import { executeAction } from "./actions.js";
function getInstalledVersion() {
  const pkgPath = path.join(process.cwd(), "node_modules", "mantis-ai", "package.json");
  return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
}
let _updateAvailable = null;
function getUpdateAvailable() {
  return _updateAvailable;
}
function setUpdateAvailable(v) {
  _updateAvailable = v;
}
function isVersionNewer(candidate, baseline) {
  if (candidate.includes("-")) return false;
  const a = candidate.split(".").map(Number);
  const b = baseline.replace(/-.*$/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}
async function runVersionCheck() {
  try {
    const res = await fetch("https://registry.npmjs.org/mantis-ai/latest");
    if (!res.ok) {
      console.warn(`[version check] npm registry returned ${res.status}`);
      return;
    }
    const data = await res.json();
    const latest = data.version;
    const installed = getInstalledVersion();
    if (isVersionNewer(latest, installed)) {
      console.log(`[version check] update available: ${installed} \u2192 ${latest}`);
      setUpdateAvailable(latest);
      const { setAvailableVersion } = await import("./db/update-check.js");
      setAvailableVersion(latest);
    } else {
      setUpdateAvailable(null);
      const { clearAvailableVersion } = await import("./db/update-check.js");
      clearAvailableVersion();
    }
  } catch (err) {
    console.warn(`[version check] failed: ${err.message}`);
  }
}
function startBuiltinCrons() {
  cron.schedule("0 * * * *", runVersionCheck);
  runVersionCheck();
}
let _tasks = [];
function loadCrons() {
  const cronFile = cronsFile;
  console.log("\n--- Cron Jobs ---");
  if (!fs.existsSync(cronFile)) {
    console.log("No CRONS.json found");
    console.log("-----------------\n");
    return [];
  }
  const crons = JSON.parse(fs.readFileSync(cronFile, "utf8"));
  const tasks = [];
  for (const cronEntry of crons) {
    const { name, schedule, type = "agent", enabled } = cronEntry;
    if (enabled === false) continue;
    if (!cron.validate(schedule)) {
      console.error(`Invalid schedule for "${name}": ${schedule}`);
      continue;
    }
    const task = cron.schedule(schedule, async () => {
      const startedAt = Date.now();
      try {
        const result = await executeAction(cronEntry, { cwd: cronDir, source: "cron" });
        const output = result ? String(result) : "ran";
        console.log(`[CRON] ${name}: ${output}`);
        console.log(`[CRON] ${name}: completed!`);
        try {
          const { insertCronRun } = await import("./db/cron-runs.js");
          insertCronRun({
            cronName: name,
            status: "success",
            startedAt,
            completedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            output
          });
        } catch {
        }
      } catch (err) {
        console.error(`[CRON] ${name}: error - ${err.message}`);
        try {
          const { insertCronRun } = await import("./db/cron-runs.js");
          insertCronRun({
            cronName: name,
            status: "error",
            startedAt,
            completedAt: Date.now(),
            durationMs: Date.now() - startedAt,
            error: err.message
          });
        } catch {
        }
      }
    });
    tasks.push({ name, schedule, type, task });
  }
  if (tasks.length === 0) {
    console.log("No active cron jobs");
  } else {
    for (const { name, schedule, type } of tasks) {
      console.log(`  ${name}: ${schedule} (${type})`);
    }
  }
  console.log("-----------------\n");
  _tasks = tasks;
  return tasks;
}
function stopCrons() {
  for (const { task } of _tasks) {
    try {
      task.stop();
    } catch {
    }
  }
  _tasks = [];
}
function reloadCrons() {
  stopCrons();
  loadCrons();
}
function validateSchedule(schedule) {
  return cron.validate(schedule);
}
export {
  getInstalledVersion,
  getUpdateAvailable,
  loadCrons,
  reloadCrons,
  setUpdateAvailable,
  startBuiltinCrons,
  stopCrons,
  validateSchedule
};
