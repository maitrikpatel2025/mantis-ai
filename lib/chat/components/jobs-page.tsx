'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SpinnerIcon, RefreshIcon, ChevronDownIcon, SearchIcon, ServerIcon, CloudIcon, ZapIcon, XIcon, RotateCcwIcon } from './icons.js';
import { getJobs, getJob, getJobDashboardCounts, cancelJobAction, retryJobAction } from '../actions.js';
import { useEventStream } from '../../events/use-event-stream.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function truncate(str: string, len: number = 120): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

const STATUS_STYLES: Record<string, string> = {
  created: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  queued: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const SOURCE_STYLES: Record<string, string> = {
  chat: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  cron: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  trigger: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  api: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
};

const FILTER_STATUSES = ['all', 'created', 'queued', 'completed', 'failed'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-border/50" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner Badge
// ─────────────────────────────────────────────────────────────────────────────

interface RunnerBadgeProps {
  runnerType?: string;
}

function RunnerBadge({ runnerType }: RunnerBadgeProps) {
  if (!runnerType) return null;
  const isWarm = runnerType === 'warm';
  const isLocal = runnerType === 'local';
  const style = isWarm
    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    : isLocal
      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
      : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400';
  const Icon = isWarm ? ZapIcon : isLocal ? ServerIcon : CloudIcon;
  const label = isWarm ? 'Warm' : isLocal ? 'Local' : 'GitHub';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${style}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Row (expandable)
// ─────────────────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  status: string;
  prompt: string;
  source: string;
  createdAt: number;
  runnerType?: string;
  enrichedPrompt?: string;
  summary?: string;
  error?: string;
  branch?: string;
  prUrl?: string;
  runUrl?: string;
  [key: string]: any;
}

interface JobRowProps {
  job: Job;
  onRefresh: () => void;
}

function JobRow({ job, onRefresh }: JobRowProps) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [detail, setDetail] = useState<Job | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleExpand = async () => {
    if (!expanded && !detail) {
      try {
        const full = await getJob(job.id) as Job | null;
        setDetail(full);
      } catch {}
    }
    setExpanded(!expanded);
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading('cancel');
    setActionError(null);
    try {
      const result = await cancelJobAction(job.id);
      if (result.success) {
        onRefresh();
      } else {
        setActionError(result.message || 'Cancel failed');
      }
    } catch (err) {
      setActionError('Cancel failed');
    }
    setActionLoading(null);
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading('retry');
    setActionError(null);
    try {
      const result = await retryJobAction(job.id);
      if (result.success) {
        onRefresh();
      } else {
        setActionError(result.message || 'Retry failed');
      }
    } catch (err) {
      setActionError('Retry failed');
    }
    setActionLoading(null);
  };

  const data = detail || job;
  const isActive = job.status === 'created' || job.status === 'queued';

  return (
    <div className="border border-border rounded-lg bg-card shadow-xs">
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors rounded-lg"
      >
        {/* Status badge */}
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0 ${STATUS_STYLES[job.status] || 'bg-muted text-muted-foreground'}`}>
          {job.status}
        </span>

        {/* Runner badge */}
        <RunnerBadge runnerType={job.runnerType} />

        {/* Prompt */}
        <span className="text-sm truncate flex-1 min-w-0">
          {truncate(job.prompt, 80)}
        </span>

        {/* Source */}
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${SOURCE_STYLES[job.source] || 'bg-muted text-muted-foreground'}`}>
          {job.source}
        </span>

        {/* Time */}
        <span className="text-xs text-muted-foreground shrink-0">
          {timeAgo(job.createdAt)}
        </span>

        {/* Expand chevron */}
        <ChevronDownIcon
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
          {/* Full prompt */}
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1">Prompt</p>
            <p className="text-sm whitespace-pre-wrap">{data.prompt}</p>
          </div>

          {/* Enriched prompt (if different) */}
          {data.enrichedPrompt && data.enrichedPrompt !== data.prompt && (
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1">Enriched Prompt</p>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{data.enrichedPrompt}</p>
            </div>
          )}

          {/* Summary */}
          {data.summary && (
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1">Summary</p>
              <p className="text-sm whitespace-pre-wrap">{data.summary}</p>
            </div>
          )}

          {/* Error */}
          {data.error && (
            <div>
              <p className="text-[10px] font-medium uppercase text-red-500 mb-1">Error</p>
              <p className="text-sm whitespace-pre-wrap text-red-600 dark:text-red-400">{data.error}</p>
            </div>
          )}

          {/* Links + Actions row */}
          <div className="flex items-center gap-3 pt-1">
            {data.branch && (
              <span className="text-xs text-muted-foreground font-mono">{data.branch}</span>
            )}
            {data.prUrl && (
              <a
                href={data.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                View PR
              </a>
            )}
            {data.runUrl && (
              <a
                href={data.runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                View Run
              </a>
            )}

            <span className="flex-1" />

            {/* Cancel button (for active jobs) */}
            {isActive && (
              <button
                onClick={handleCancel}
                disabled={actionLoading === 'cancel'}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {actionLoading === 'cancel' ? <SpinnerIcon size={12} /> : <XIcon size={12} />}
                Cancel
              </button>
            )}

            {/* Retry button (for failed/completed jobs) */}
            {(job.status === 'failed' || job.status === 'completed') && (
              <button
                onClick={handleRetry}
                disabled={actionLoading === 'retry'}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {actionLoading === 'retry' ? <SpinnerIcon size={12} /> : <RotateCcwIcon size={12} />}
                Retry
              </button>
            )}

            <span className="text-xs text-muted-foreground">
              ID: {job.id.slice(0, 8)}
            </span>
          </div>

          {/* Action error */}
          {actionError && (
            <p className="text-xs text-red-600 dark:text-red-400">{actionError}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

interface JobCounts {
  created: number;
  queued: number;
  completed: number;
  failed: number;
  [key: string]: number;
}

interface JobsPageProps {
  session: any;
}

export function JobsPage({ session }: JobsPageProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<JobCounts>({ created: 0, queued: 0, completed: 0, failed: 0 });
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchData = useCallback(async (p: number, status: string) => {
    try {
      const [jobList, jobCounts] = await Promise.all([
        getJobs(p, status === 'all' ? undefined : status),
        getJobDashboardCounts(),
      ]);
      setJobs((jobList || []) as Job[]);
      setCounts((jobCounts || { created: 0, queued: 0, completed: 0, failed: 0 }) as JobCounts);
      setPage(p);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(1, filter); }, [fetchData, filter]);

  // SSE: refetch on job events (debounced)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleJobEvent = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => fetchData(page, filter), 500);
  }, [fetchData, page, filter]);

  useEventStream('job:created', handleJobEvent);
  useEventStream('job:updated', handleJobEvent);
  useEventStream('job:completed', handleJobEvent);
  useEventStream('job:failed', handleJobEvent);

  const handleFilterChange = (status: string) => {
    setFilter(status);
    setLoading(true);
    setPage(1);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData(page, filter);
  };

  const totalCount = counts.created + counts.queued + counts.completed + counts.failed;

  return (
    <>
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {FILTER_STATUSES.map((status) => {
          const count = status === 'all' ? totalCount : (counts[status] || 0);
          const isActive = filter === status;
          return (
            <button
              key={status}
              onClick={() => handleFilterChange(status)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="capitalize">{status}</span>
              <span className={`inline-flex items-center justify-center rounded-full min-w-[18px] px-1 py-0.5 text-[10px] leading-none ${
                isActive ? 'bg-background/20' : 'bg-border'
              }`}>
                {count}
              </span>
            </button>
          );
        })}

        <div className="flex-1" />

        {!loading && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground shadow-xs disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {refreshing ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Job list */}
      {loading ? (
        <LoadingSkeleton />
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <SearchIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No jobs found</p>
          <p className="text-xs text-muted-foreground">
            {filter !== 'all' ? `No ${filter} jobs. Try a different filter.` : 'Jobs will appear here when created via chat, cron, trigger, or API.'}
          </p>
        </div>
      ) : (
        <div>
          <div className="flex flex-col gap-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onRefresh={handleRefresh} />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <button
              onClick={() => { setRefreshing(true); fetchData(page - 1, filter); }}
              disabled={page <= 1 || refreshing}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <button
              onClick={() => { setRefreshing(true); fetchData(page + 1, filter); }}
              disabled={jobs.length < 20 || refreshing}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
