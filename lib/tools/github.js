async function githubApi(endpoint, options = {}) {
  const { GH_TOKEN } = process.env;
  const headers = {
    "Authorization": `Bearer ${GH_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${error}`);
  }
  return await res.json();
}
async function getWorkflowRuns(status, { workflow, page = 1, perPage = 100 } = {}) {
  const { GH_OWNER, GH_REPO } = process.env;
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("per_page", String(perPage));
  params.set("page", String(page));
  const query = params.toString();
  const path = workflow ? `/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${workflow}/runs?${query}` : `/repos/${GH_OWNER}/${GH_REPO}/actions/runs?${query}`;
  return githubApi(path);
}
async function getWorkflowRunJobs(runId) {
  const { GH_OWNER, GH_REPO } = process.env;
  return githubApi(`/repos/${GH_OWNER}/${GH_REPO}/actions/runs/${runId}/jobs`);
}
async function getJobStatus(jobId) {
  let inProgress;
  let queued;
  try {
    [inProgress, queued] = await Promise.all([
      getWorkflowRuns("in_progress", { workflow: "run-job.yml" }),
      getWorkflowRuns("queued", { workflow: "run-job.yml" })
    ]);
  } catch (err) {
    return { jobs: [], queued: 0, running: 0, note: "No run-job.yml workflow found \u2014 deploy GitHub Actions workflows to enable job execution." };
  }
  const allRuns = [...inProgress.workflow_runs || [], ...queued.workflow_runs || []];
  const jobRuns = allRuns.filter((run) => run.head_branch?.startsWith("job/"));
  const filteredRuns = jobId ? jobRuns.filter((run) => run.head_branch === `job/${jobId}`) : jobRuns;
  const jobs = await Promise.all(
    filteredRuns.map(async (run) => {
      const extractedJobId = run.head_branch.slice(4);
      const startedAt = new Date(run.created_at);
      const durationMinutes = Math.round((Date.now() - startedAt.getTime()) / 6e4);
      let currentStep = null;
      let stepsCompleted = 0;
      let stepsTotal = 0;
      try {
        const jobsData = await getWorkflowRunJobs(run.id);
        if (jobsData.jobs?.length > 0) {
          const job = jobsData.jobs[0];
          stepsTotal = job.steps?.length || 0;
          stepsCompleted = job.steps?.filter((s) => s.status === "completed").length || 0;
          currentStep = job.steps?.find((s) => s.status === "in_progress")?.name || null;
        }
      } catch (err) {
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
        run_id: run.id
      };
    })
  );
  const runningCount = jobs.filter((j) => j.status === "in_progress").length;
  const queuedCount = jobs.filter((j) => j.status === "queued").length;
  return {
    jobs,
    queued: queuedCount,
    running: runningCount
  };
}
async function getSwarmStatus(page = 1) {
  const data = await getWorkflowRuns(null, { page, perPage: 25 });
  const runs = (data.workflow_runs || []).map((run) => ({
    run_id: run.id,
    branch: run.head_branch,
    status: run.status,
    conclusion: run.conclusion,
    workflow_name: run.name,
    started_at: run.created_at,
    updated_at: run.updated_at,
    duration_seconds: Math.round((Date.now() - new Date(run.created_at).getTime()) / 1e3),
    html_url: run.html_url
  }));
  return {
    runs,
    hasMore: page * 25 < (data.total_count || 0)
  };
}
async function triggerWorkflowDispatch(workflowId, ref = "main", inputs = {}) {
  const { GH_OWNER, GH_REPO } = process.env;
  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ref, inputs })
    }
  );
  if (!res.ok && res.status !== 204) {
    const error = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${error}`);
  }
  return { success: true };
}
async function cancelWorkflowRun(runId) {
  const { GH_OWNER, GH_REPO } = process.env;
  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/runs/${runId}/cancel`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );
  if (!res.ok && res.status !== 202 && res.status !== 409) {
    const error = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${error}`);
  }
  return { success: true };
}
async function findWorkflowRunForBranch(branch) {
  const { GH_OWNER, GH_REPO } = process.env;
  const params = new URLSearchParams({ branch, per_page: "5" });
  try {
    const data = await githubApi(
      `/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/run-job.yml/runs?${params}`
    );
    const run = (data.workflow_runs || []).find(
      (r) => r.status === "in_progress" || r.status === "queued"
    );
    return run?.id || null;
  } catch (err) {
    console.error(`[github] Failed to find workflow run for ${branch}:`, err.message);
    return null;
  }
}
export {
  cancelWorkflowRun,
  findWorkflowRunForBranch,
  getJobStatus,
  getSwarmStatus,
  getWorkflowRunJobs,
  getWorkflowRuns,
  githubApi,
  triggerWorkflowDispatch
};
