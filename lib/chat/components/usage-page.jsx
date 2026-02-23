'use client';

import { useState, useEffect } from 'react';
import { SpinnerIcon, BarChartIcon } from './icons.js';

const PERIODS = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All' },
];

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(microdollars) {
  if (!microdollars) return '$0.00';
  const dollars = microdollars / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

function formatDuration(ms) {
  if (!ms) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data, label }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No data</p>;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-foreground/20 rounded-t transition-all"
              style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
            />
            <span className="text-[9px] text-muted-foreground truncate max-w-full">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UsagePage({ getUsageStatsAction, getUsageByModelAction, getUsageByDayAction }) {
  const [period, setPeriod] = useState('7d');
  const [stats, setStats] = useState(null);
  const [byModel, setByModel] = useState([]);
  const [byDay, setByDay] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const dayMap = { '24h': 1, '7d': 7, '30d': 30, 'all': 365 };
    Promise.all([
      getUsageStatsAction(period),
      getUsageByModelAction(period),
      getUsageByDayAction(dayMap[period] || 7),
    ])
      .then(([s, m, d]) => {
        setStats(s);
        setByModel(m);
        setByDay(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <>
      {/* Period selector */}
      <div className="flex gap-1 mb-6">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              period === p.id
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <SpinnerIcon size={20} />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Requests" value={stats?.totalRequests || 0} />
            <StatCard
              label="Total Tokens"
              value={formatTokens(stats?.totalTokens || 0)}
              sub={`${formatTokens(stats?.totalPromptTokens || 0)} in / ${formatTokens(stats?.totalCompletionTokens || 0)} out`}
            />
            <StatCard label="Est. Cost" value={formatCost(stats?.totalCostUsd)} />
            <StatCard label="Avg Latency" value={formatDuration(stats?.avgDurationMs)} />
          </div>

          {/* Daily bar chart */}
          <div className="rounded-lg border bg-card p-4 mb-6">
            <BarChart
              label="Requests per day"
              data={byDay.map((d) => ({ label: d.day?.slice(5) || '', value: Number(d.requests) }))}
            />
          </div>

          {/* Model breakdown */}
          {byModel.length > 0 && (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-medium">Usage by Model</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left px-4 py-2 font-medium">Model</th>
                    <th className="text-left px-4 py-2 font-medium">Provider</th>
                    <th className="text-right px-4 py-2 font-medium">Requests</th>
                    <th className="text-right px-4 py-2 font-medium">Tokens</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{row.model}</td>
                      <td className="px-4 py-2 text-muted-foreground">{row.provider}</td>
                      <td className="px-4 py-2 text-right">{row.requests}</td>
                      <td className="px-4 py-2 text-right">{formatTokens(Number(row.totalTokens))}</td>
                      <td className="px-4 py-2 text-right">{formatCost(Number(row.totalCost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!stats?.totalRequests && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <BarChartIcon size={24} />
              </div>
              <p className="text-sm font-medium mb-1">No usage data yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Start chatting with your agent to see usage analytics here.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
