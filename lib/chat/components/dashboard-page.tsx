'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { SpinnerIcon, ClockIcon, SwarmIcon, SettingsIcon, LayoutDashboardIcon, ZapIcon } from './icons.js';
import { AreaChart, DonutChart } from './charts.js';

interface JobCounts {
  created: number;
  queued: number;
  completed: number;
  failed: number;
}

interface WarmPool {
  available: number;
  size: number;
  busy: number;
}

interface Notification {
  notification: string;
  createdAt?: number;
}

interface DashboardData {
  uptimeMs?: number;
  dbSizeBytes?: number;
  activeChannels?: number;
  activeCrons?: number;
  totalAgents?: number;
  nodeVersion?: string;
  jobCounts?: JobCounts;
  warmPool?: WarmPool;
  recentNotifications?: Notification[];
}

interface SparklinePoint {
  day?: string;
  value: number;
}

interface DashboardCharts {
  tokenSparkline?: SparklinePoint[];
  costSparkline?: SparklinePoint[];
  jobsSparkline?: SparklinePoint[];
}

interface ChartDataPoint {
  label: string;
  value: number;
}

const STAT_ACCENTS = [
  'border-l-emerald-500',
  'border-l-blue-500',
  'border-l-orange-500',
  'border-l-purple-500',
  'border-l-sky-500',
  'border-l-rose-500',
  'border-l-amber-500',
];

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accentIndex?: number;
}

function StatCard({ label, value, sub, accentIndex = 0 }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-l-4 ${STAT_ACCENTS[accentIndex % STAT_ACCENTS.length]} bg-card p-4 shadow-xs hover:shadow-md transition-shadow`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xl font-semibold mt-1.5 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function formatUptime(ms: number | undefined): string {
  if (!ms) return '\u2014';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '\u2014';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(ts: number | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCostShort(microdollars: number): string {
  if (!microdollars) return '$0';
  const dollars = microdollars / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

interface DashboardPageProps {
  session: any;
  getDashboardDataAction: () => Promise<DashboardData>;
  getDashboardChartsAction?: () => Promise<DashboardCharts>;
}

export function DashboardPage({ session, getDashboardDataAction, getDashboardChartsAction }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const promises: Promise<any>[] = [getDashboardDataAction().catch(() => null)];
    if (getDashboardChartsAction) {
      promises.push(getDashboardChartsAction().catch(() => null));
    }
    Promise.all(promises)
      .then(([d, c]) => {
        setData(d);
        if (c) setCharts(c);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageLayout session={session} title="Dashboard">
      <p className="text-sm text-muted-foreground mb-6">Overview of your agent system.</p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <SpinnerIcon size={20} />
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <LayoutDashboardIcon size={24} />
          </div>
          <p className="text-sm font-medium">Could not load dashboard data</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <StatCard label="Uptime" value={formatUptime(data.uptimeMs)} accentIndex={0} />
            <StatCard label="Database Size" value={formatBytes(data.dbSizeBytes)} accentIndex={1} />
            <StatCard label="Active Channels" value={data.activeChannels || 0} accentIndex={2} />
            <StatCard label="Active Crons" value={data.activeCrons || 0} accentIndex={3} />
            <StatCard label="Agents" value={data.totalAgents || 0} accentIndex={4} />
            {data.jobCounts && (
              <StatCard
                label="Jobs"
                value={(data.jobCounts.created || 0) + (data.jobCounts.queued || 0) + (data.jobCounts.completed || 0) + (data.jobCounts.failed || 0)}
                sub={`${(data.jobCounts.created || 0) + (data.jobCounts.queued || 0)} active`}
                accentIndex={5}
              />
            )}
            {!data.jobCounts && <StatCard label="Node.js" value={data.nodeVersion || '\u2014'} accentIndex={5} />}
            {data.warmPool && (
              <StatCard
                label="Warm Pool"
                value={`${data.warmPool.available}/${data.warmPool.size}`}
                sub={data.warmPool.busy > 0 ? `${data.warmPool.busy} busy` : 'All idle'}
                accentIndex={6}
              />
            )}
          </div>

          {/* Sparkline charts */}
          {charts && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <div className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Token Usage (7d)</p>
                <AreaChart
                  data={(charts.tokenSparkline || []).map((d) => ({ label: d.day?.slice(5) || '', value: d.value }))}
                  color="emerald"
                  formatValue={formatTokensShort}
                />
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Cost Trend (7d)</p>
                <AreaChart
                  data={(charts.costSparkline || []).map((d) => ({ label: d.day?.slice(5) || '', value: d.value }))}
                  color="amber"
                  formatValue={formatCostShort}
                />
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Jobs Created (7d)</p>
                <AreaChart
                  data={(charts.jobsSparkline || []).map((d) => ({ label: d.day?.slice(5) || '', value: d.value }))}
                  color="blue"
                />
              </div>
            </div>
          )}

          {/* Job status donut */}
          {data.jobCounts && (data.jobCounts.completed > 0 || data.jobCounts.failed > 0 || data.jobCounts.created > 0 || data.jobCounts.queued > 0) && (
            <div className="rounded-xl border bg-card p-4 shadow-xs mb-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Job Status Distribution</p>
              <DonutChart
                data={[
                  ...(data.jobCounts.completed ? [{ label: 'Completed', value: data.jobCounts.completed, color: '#10b981' }] : []),
                  ...(data.jobCounts.failed ? [{ label: 'Failed', value: data.jobCounts.failed, color: '#f43f5e' }] : []),
                  ...((data.jobCounts.created + data.jobCounts.queued) ? [{ label: 'Active', value: data.jobCounts.created + data.jobCounts.queued, color: '#3b82f6' }] : []),
                ]}
              />
            </div>
          )}

          {/* Recent notifications */}
          <div className="rounded-xl border bg-card shadow-xs mb-6">
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-semibold">Recent Notifications</p>
            </div>
            {(!data.recentNotifications || data.recentNotifications.length === 0) ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">No recent notifications</p>
            ) : (
              <div className="divide-y">
                {data.recentNotifications.map((n, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                    <p className="text-sm truncate flex-1">{n.notification}</p>
                    <span className="text-xs text-muted-foreground shrink-0 ml-3">{timeAgo(n.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <a href="/swarm" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
              <SwarmIcon size={14} />
              View Swarm
            </a>
            <a href="/settings/crons" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
              <ClockIcon size={14} />
              Cron Jobs
            </a>
            <a href="/settings/secrets" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
              <SettingsIcon size={14} />
              Settings
            </a>
          </div>
        </>
      )}
    </PageLayout>
  );
}
