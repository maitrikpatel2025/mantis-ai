'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from './page-layout.js';
import { SpinnerIcon, ClockIcon, SwarmIcon, SettingsIcon, LayoutDashboardIcon } from './icons.js';

const STAT_ACCENTS = [
  'border-l-emerald-500',
  'border-l-blue-500',
  'border-l-orange-500',
  'border-l-purple-500',
  'border-l-sky-500',
  'border-l-rose-500',
];

function StatCard({ label, value, sub, accentIndex = 0 }) {
  return (
    <div className={`rounded-xl border border-l-4 ${STAT_ACCENTS[accentIndex % STAT_ACCENTS.length]} bg-card p-4 shadow-xs hover:shadow-md transition-shadow`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-xl font-semibold mt-1.5 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function formatUptime(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

export function DashboardPage({ session, getDashboardDataAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardDataAction()
      .then((d) => setData(d))
      .catch(() => {})
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
            {!data.jobCounts && <StatCard label="Node.js" value={data.nodeVersion || '—'} accentIndex={5} />}
          </div>

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
