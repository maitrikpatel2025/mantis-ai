import { exec } from "child_process";
import { promisify } from "util";
import { createJob } from "./tools/create-job.js";
const execAsync = promisify(exec);
async function executeAction(action, opts = {}) {
  const type = action.type || "agent";
  if (type === "command") {
    const { stdout, stderr } = await execAsync(action.command, { cwd: opts.cwd });
    return (stdout || stderr || "").trim();
  }
  if (type === "webhook") {
    const method = (action.method || "POST").toUpperCase();
    const headers = { "Content-Type": "application/json", ...action.headers || {} };
    const fetchOpts = { method, headers };
    if (method !== "GET") {
      const body = { ...action.vars || {} };
      if (opts.data) body.data = opts.data;
      fetchOpts.body = JSON.stringify(body);
    }
    const res = await fetch(action.url, fetchOpts);
    return `${method} ${action.url} \u2192 ${res.status}`;
  }
  const result = await createJob(action.job, { source: opts.source || "unknown" });
  return `job ${result.job_id}`;
}
export {
  executeAction
};
