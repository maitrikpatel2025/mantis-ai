import { v4 as uuidv4 } from 'uuid';
import { githubApi } from './github.js';

interface CreateJobOptions {
  source?: string;
  chatId?: string;
}

interface CreateJobResult {
  job_id: string;
  branch: string;
}

interface GitRef {
  object: { sha: string };
}

interface GitCommit {
  tree: { sha: string };
}

interface GitTree {
  sha: string;
}

interface GitNewCommit {
  sha: string;
}

interface TreeEntry {
  path: string;
  mode: string;
  type: string;
  content: string;
}

/**
 * Create a new job branch with updated job.md
 */
async function createJob(jobDescription: string, { source = 'chat', chatId }: CreateJobOptions = {}): Promise<CreateJobResult> {
  const { GH_OWNER, GH_REPO } = process.env;
  const jobId = uuidv4();
  const branch = `job/${jobId}`;

  // Enrich prompt with relevant memories
  let enrichedPrompt: string = jobDescription;
  try {
    const { enrichPromptWithMemory } = await import('../memory/index.js');
    enrichedPrompt = enrichPromptWithMemory(jobDescription);
  } catch (err) {
    console.error('[create-job] Memory enrichment failed:', (err as Error).message);
  }

  // Determine execution mode
  const { getExecutionMode } = await import('../execution/router.js');
  const executionMode: 'github' | 'local' = getExecutionMode();

  // Insert job record into DB (fail fast if DB is unavailable)
  const { insertJob } = await import('../db/jobs.js');
  insertJob({ id: jobId, prompt: jobDescription, enrichedPrompt, source, branch, runnerType: executionMode, chatId });

  // 1. Get main branch SHA
  const mainRef = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/ref/heads/main`) as unknown as GitRef;
  const mainSha: string = mainRef.object.sha;

  // 2. Get the base tree
  const mainCommit = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/commits/${mainSha}`) as unknown as GitCommit;
  const baseTreeSha: string = mainCommit.tree.sha;

  // 3. Build tree entries — job.md + optional .mantis-local marker in a single commit
  const treeEntries: TreeEntry[] = [
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
  }) as unknown as GitTree;

  // 5. Create commit
  const commit = await githubApi(`/repos/${GH_OWNER}/${GH_REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `job: ${jobId}`,
      tree: tree.sha,
      parents: [mainSha],
    }),
  }) as unknown as GitNewCommit;

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
    console.error('[create-job] Failed to update job status:', (err as Error).message);
  }

  // If local, try warm pool first, fall back to cold execution
  if (executionMode === 'local') {
    let usedWarmPool = false;
    try {
      const { getWarmPool } = await import('../execution/warm-pool.js');
      const pool = getWarmPool();
      if (pool?.hasAvailableWorker()) {
        const { updateJob } = await import('../db/jobs.js');
        updateJob(jobId, { runnerType: 'warm' });
        pool.assignJob(jobId, branch).catch((err: Error) => {
          console.error(`[warm-pool] Job ${jobId} failed:`, err.message);
        });
        usedWarmPool = true;
      }
    } catch {}

    if (!usedWarmPool) {
      const { runJobLocally } = await import('../execution/local-runner.js');
      runJobLocally(jobId, branch).catch((err: Error) => {
        console.error(`[local-runner] Job ${jobId} failed:`, err.message);
      });
    }
  }
  // GitHub Actions triggers automatically on branch creation for 'github' mode

  return { job_id: jobId, branch };
}

export { createJob };
