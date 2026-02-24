import { v4 as uuidv4 } from 'uuid';
import { githubApi } from './github.js';

/**
 * Create a new job branch with updated job.md
 * @param {string} jobDescription - The job description to write to job.md
 * @param {object} [options] - Optional metadata
 * @param {string} [options.source='chat'] - Job source: chat|cron|trigger|api
 * @param {string} [options.chatId] - Associated chat ID
 * @returns {Promise<{job_id: string, branch: string}>} - Job ID and branch name
 */
async function createJob(jobDescription, { source = 'chat', chatId } = {}) {
  const { GH_OWNER, GH_REPO } = process.env;
  const jobId = uuidv4();
  const branch = `job/${jobId}`;

  // Enrich prompt with relevant memories
  let enrichedPrompt = jobDescription;
  try {
    const { enrichPromptWithMemory } = await import('../memory/index.js');
    enrichedPrompt = enrichPromptWithMemory(jobDescription);
  } catch (err) {
    console.error('[create-job] Memory enrichment failed:', err.message);
  }

  // Determine execution mode
  const { getExecutionMode } = await import('../execution/router.js');
  const executionMode = getExecutionMode();

  // Insert job record into DB (fail fast if DB is unavailable)
  const { insertJob } = await import('../db/jobs.js');
  insertJob({ id: jobId, prompt: jobDescription, enrichedPrompt, source, branch, runnerType: executionMode, chatId });

  // 1. Get main branch SHA
  const mainRef = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/ref/heads/main`);
  const mainSha = mainRef.object.sha;

  // 2. Get the base tree
  const mainCommit = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/commits/${mainSha}`);
  const baseTreeSha = mainCommit.tree.sha;

  // 3. Build tree entries — job.md + optional .mantis-local marker in a single commit
  const treeEntries = [
    {
      path: `logs/${jobId}/job.md`,
      mode: '100644',
      type: 'blob',
      content: enrichedPrompt,
    },
  ];

  if (executionMode === 'local') {
    treeEntries.push({
      path: '.mantis-local',
      mode: '100644',
      type: 'blob',
      content: jobId,
    });
  }

  // 4. Create tree
  const tree = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeEntries,
    }),
  });

  // 5. Create commit
  const commit = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `job: ${jobId}`,
      tree: tree.sha,
      parents: [mainSha],
    }),
  });

  // 6. Create branch pointing to the new commit (atomic — workflow trigger sees all files)
  await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: commit.sha,
    }),
  });

  // Update job status to queued (runnerType already set on insert)
  try {
    const { updateJob } = await import('../db/jobs.js');
    updateJob(jobId, { status: 'queued' });
  } catch (err) {
    console.error('[create-job] Failed to update job status:', err.message);
  }

  // If local, spawn container (fire-and-forget)
  if (executionMode === 'local') {
    const { runJobLocally } = await import('../execution/local-runner.js');
    runJobLocally(jobId, branch).catch(err => {
      console.error(`[local-runner] Job ${jobId} failed:`, err.message);
    });
  }
  // GitHub Actions triggers automatically on branch creation for 'github' mode

  return { job_id: jobId, branch };
}

export { createJob };
