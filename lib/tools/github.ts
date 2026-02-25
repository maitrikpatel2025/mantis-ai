interface GitHubFetchOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

interface WorkflowRun {
  id: number;
  head_branch: string;
  status: string;
  conclusion: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

interface WorkflowRunsResponse {
  total_count: number;
  workflow_runs: WorkflowRun[];
}

interface WorkflowStep {
  name: string;
  status: string;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
}

interface WorkflowRunJobsResponse {
  jobs: WorkflowJob[];
}

interface JobStatusEntry {
  job_id: string;
  branch: string;
  status: string;
  started_at: string;
  duration_minutes: number;
  current_step: string | null;
  steps_completed: number;
  steps_total: number;
  run_id: number;
}

interface JobStatusResult {
  jobs: JobStatusEntry[];
  queued: number;
  running: number;
  note?: string;
}

interface SwarmRun {
  run_id: number;
  branch: string;
  status: string;
  conclusion: string | null;
  workflow_name: string;
  started_at: string;
  updated_at: string;
  duration_seconds: number;
  html_url: string;
}

interface SwarmStatusResult {
  runs: SwarmRun[];
  hasMore: boolean;
}

interface GetWorkflowRunsOptions {
  workflow?: string;
  page?: number;
  perPage?: number;
}

/**
 * GitHub REST API helper with authentication
 */
async function githubApi(endpoint: string, options: GitHubFetchOptions = {}): Promise<Record<string, unknown>> {
  const { GH_TOKEN } = process.env;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${GH_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${error}`);
  }

  return await res.json() as Record<string, unknown>;
}

/**
 * Get workflow runs with optional status and workflow filter
 */
async function getWorkflowRuns(
  status: string | null | undefined,
  { workflow, page = 1, perPage = 100 }: GetWorkflowRunsOptions = {}
): Promise<WorkflowRunsResponse> {
  const { GH_OWNER, GH_REPO } = process.env;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('per_page', String(perPage));
  params.set('page', String(page));

  const query = params.toString();
  const path = workflow
    ? `/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${workflow}/runs?${query}`
    : `/repos/${GH_OWNER}/${GH_REPO}/actions/runs?${query}`;
  return githubApi(path) as unknown as Promise<WorkflowRunsResponse>;
}

/**
 * Get jobs for a specific workflow run
 */
async function getWorkflowRunJobs(runId: number): Promise<WorkflowRunJobsResponse> {
  const { GH_OWNER, GH_REPO } = process.env;
  return githubApi(`/repos/${GH_OWNER}/${GH_REPO}/actions/runs/${runId}/jobs`) as unknown as Promise<WorkflowRunJobsResponse>;
}

/**
 * Get job status for running/recent jobs
 */
async function getJobStatus(jobId?: string): Promise<JobStatusResult> {
  // Fetch both in_progress and queued runs (scoped to run-job.yml)
  let inProgress: WorkflowRunsResponse;
  let queued: WorkflowRunsResponse;
  try {
    [inProgress, queued] = await Promise.all([
      getWorkflowRuns('in_progress', { workflow: 'run-job.yml' }),
      getWorkflowRuns('queued', { workflow: 'run-job.yml' }),
    ]);
  } catch (err) {
    // Workflow may not exist yet (no run-job.yml in repo)
    return { jobs: [], queued: 0, running: 0, note: 'No run-job.yml workflow found — deploy GitHub Actions workflows to enable job execution.' };
  }

  const allRuns = [...(inProgress.workflow_runs || []), ...(queued.workflow_runs || [])];

  // Filter to only job/* branches
  const jobRuns = allRuns.filter(run => run.head_branch?.startsWith('job/'));

  // If specific job requested, filter further
  const filteredRuns = jobId
    ? jobRuns.filter(run => run.head_branch === `job/${jobId}`)
    : jobRuns;

  // Get detailed job info for each run
  const jobs: JobStatusEntry[] = await Promise.all(
    filteredRuns.map(async (run): Promise<JobStatusEntry> => {
      const extractedJobId = run.head_branch.slice(4); // Remove 'job/' prefix
      const startedAt = new Date(run.created_at);
      const durationMinutes = Math.round((Date.now() - startedAt.getTime()) / 60000);

      let currentStep: string | null = null;
      let stepsCompleted = 0;
      let stepsTotal = 0;

      try {
        const jobsData = await getWorkflowRunJobs(run.id);
        if (jobsData.jobs?.length > 0) {
          const job = jobsData.jobs[0];
          stepsTotal = job.steps?.length || 0;
          stepsCompleted = job.steps?.filter(s => s.status === 'completed').length || 0;
          currentStep = job.steps?.find(s => s.status === 'in_progress')?.name || null;
        }
      } catch (err) {
        // Jobs endpoint may fail if run hasn't started yet
      }

      return {
        job_id: extractedJobId,
        branch: run.head_branch,
        status: run.status,
        started_at: run.created_at,
        duration_minutes: durationMinutes,
        current_step: currentStep,
        steps_completed: stepsCompleted,
        steps_total: stepsTotal,
        run_id: run.id,
      };
    })
  );

  // Count only job/* branches, not all workflows
  const runningCount = jobs.filter(j => j.status === 'in_progress').length;
  const queuedCount = jobs.filter(j => j.status === 'queued').length;

  return {
    jobs,
    queued: queuedCount,
    running: runningCount,
  };
}

/**
 * Get full swarm status: unified list of all workflow runs with counts
 */
async function getSwarmStatus(page: number = 1): Promise<SwarmStatusResult> {
  const data = await getWorkflowRuns(null, { page, perPage: 25 });

  const runs: SwarmRun[] = (data.workflow_runs || []).map((run): SwarmRun => ({
    run_id: run.id,
    branch: run.head_branch,
    status: run.status,
    conclusion: run.conclusion,
    workflow_name: run.name,
    started_at: run.created_at,
    updated_at: run.updated_at,
    duration_seconds: Math.round((Date.now() - new Date(run.created_at).getTime()) / 1000),
    html_url: run.html_url,
  }));

  return {
    runs,
    hasMore: page * 25 < (data.total_count || 0),
  };
}

/**
 * Trigger a workflow via workflow_dispatch
 */
async function triggerWorkflowDispatch(
  workflowId: string,
  ref: string = 'main',
  inputs: Record<string, unknown> = {}
): Promise<{ success: boolean }> {
  const { GH_OWNER, GH_REPO } = process.env;
  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${workflowId}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs }),
    }
  );
  if (!res.ok && res.status !== 204) {
    const error = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${error}`);
  }
  return { success: true };
}

/**
 * Cancel a workflow run.
 */
async function cancelWorkflowRun(runId: number): Promise<{ success: boolean }> {
  const { GH_OWNER, GH_REPO } = process.env;
  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/runs/${runId}/cancel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  // 202 = accepted, 409 = already completed/cancelled
  if (!res.ok && res.status !== 202 && res.status !== 409) {
    const error = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${error}`);
  }
  return { success: true };
}

/**
 * Find the workflow run ID for a given job branch.
 */
async function findWorkflowRunForBranch(branch: string): Promise<number | null> {
  const { GH_OWNER, GH_REPO } = process.env;
  const params = new URLSearchParams({ branch, per_page: '5' });
  try {
    const data = await githubApi(
      `/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/run-job.yml/runs?${params}`
    ) as unknown as WorkflowRunsResponse;
    const run = (data.workflow_runs || []).find(
      (r) => r.status === 'in_progress' || r.status === 'queued'
    );
    return run?.id || null;
  } catch (err) {
    console.error(`[github] Failed to find workflow run for ${branch}:`, (err as Error).message);
    return null;
  }
}

export {
  githubApi,
  getWorkflowRuns,
  getWorkflowRunJobs,
  getJobStatus,
  getSwarmStatus,
  triggerWorkflowDispatch,
  cancelWorkflowRun,
  findWorkflowRunForBranch,
};
