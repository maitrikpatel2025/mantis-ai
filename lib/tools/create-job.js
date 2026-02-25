import { v4 as uuidv4 } from "uuid";
import { githubApi } from "./github.js";
async function createJob(jobDescription, { source = "chat", chatId } = {}) {
  const { GH_OWNER, GH_REPO } = process.env;
  const jobId = uuidv4();
  const branch = `job/${jobId}`;
  let enrichedPrompt = jobDescription;
  try {
    const { enrichPromptWithMemory } = await import("../memory/index.js");
    enrichedPrompt = enrichPromptWithMemory(jobDescription);
  } catch (err) {
    console.error("[create-job] Memory enrichment failed:", err.message);
  }
  const { getExecutionMode } = await import("../execution/router.js");
  const executionMode = getExecutionMode();
  const { insertJob } = await import("../db/jobs.js");
  insertJob({ id: jobId, prompt: jobDescription, enrichedPrompt, source, branch, runnerType: executionMode, chatId });
  const mainRef = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/ref/heads/main`);
  const mainSha = mainRef.object.sha;
  const mainCommit = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/commits/${mainSha}`);
  const baseTreeSha = mainCommit.tree.sha;
  const treeEntries = [
    {
      path: `logs/${jobId}/job.md`,
      mode: "100644",
      type: "blob",
      content: enrichedPrompt
    }
  ];
  if (executionMode === "local") {
    treeEntries.push({
      path: ".mantis-local",
      mode: "100644",
      type: "blob",
      content: jobId
    });
  }
  const tree = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeEntries
    })
  });
  const commit = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `job: ${jobId}`,
      tree: tree.sha,
      parents: [mainSha]
    })
  });
  await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: commit.sha
    })
  });
  try {
    const { updateJob } = await import("../db/jobs.js");
    updateJob(jobId, { status: "queued" });
  } catch (err) {
    console.error("[create-job] Failed to update job status:", err.message);
  }
  if (executionMode === "local") {
    let usedWarmPool = false;
    try {
      const { getWarmPool } = await import("../execution/warm-pool.js");
      const pool = getWarmPool();
      if (pool?.hasAvailableWorker()) {
        const { updateJob } = await import("../db/jobs.js");
        updateJob(jobId, { runnerType: "warm" });
        pool.assignJob(jobId, branch).catch((err) => {
          console.error(`[warm-pool] Job ${jobId} failed:`, err.message);
        });
        usedWarmPool = true;
      }
    } catch {
    }
    if (!usedWarmPool) {
      const { runJobLocally } = await import("../execution/local-runner.js");
      runJobLocally(jobId, branch).catch((err) => {
        console.error(`[local-runner] Job ${jobId} failed:`, err.message);
      });
    }
  }
  return { job_id: jobId, branch };
}
export {
  createJob
};
