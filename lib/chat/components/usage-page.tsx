'use client';

import { useState, useEffect } from 'react';
import { SpinnerIcon, BarChartIcon } from './icons.js';
import { BarChart, DonutChart, TokenBreakdownBars, SourceBreakdownBars } from './charts.js';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface UsageStats {
  totalRequests?: number;
  totalTokens?: number;
  totalPromptTokens?: number;
  totalCompletionTokens?: number;
  totalCostUsd?: number;
  avgDurationMs?: number;
}

interface ModelUsage {
  model: string;
  provider: string;
  requests: number | string;
  totalTokens: number | string;
  totalCost: number | string;
}

interface DayUsage {
  day?: string;
  requests: number | string;
  totalTokens: number | string;
  totalCost: number | string;
}

interface TokenBreakdown {
  day?: string;
  promptTokens: number | string;
  completionTokens: number | string;
}

interface SourceUsage {
  source: string;
  requests: number | string;
}

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const PERIODS = [
  { id: '24h', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'all', label: '90d' },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(microdollars: number): string {
  if (!microdollars) return '$0.00';
  const dollars = microdollars / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const STAT_ACCENTS = [
  'border-l-emerald-500',
  'border-l-blue-500',
  'border-l-orange-500',
  'border-l-purple-500',
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
      <p className="text-2xl font-semibold mt-1.5 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-foreground text-background'
          : 'bg-muted text-muted-foreground hover:bg-accent'
      }`}
    >
      {label}
    </button>
  );
}

interface ChartTab {
  id: string;
  label: string;
  color: string;
}

const CHART_TABS: ChartTab[] = [
  { id: 'requests', label: 'Requests', color: 'emerald' },
  { id: 'tokens', label: 'Tokens', color: 'blue' },
  { id: 'cost', label: 'Cost', color: 'amber' },
];

interface UsagePageProps {
  getUsageStatsAction: (period: string) => Promise<UsageStats>;
  getUsageByModelAction: (period: string) => Promise<ModelUsage[]>;
  getUsageByDayAction: (days: number) => Promise<DayUsage[]>;
  getTokenBreakdownByDayAction?: (days: number) => Promise<TokenBreakdown[]>;
  getUsageBySourceAction?: (period: string) => Promise<SourceUsage[]>;
}

export function UsagePage({ getUsageStatsAction, getUsageByModelAction, getUsageByDayAction, getTokenBreakdownByDayAction, getUsageBySourceAction }: UsagePageProps) {
  const [period, setPeriod] = useState<string>('7d');
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [byModel, setByModel] = useState<ModelUsage[]>([]);
  const [byDay, setByDay] = useState<DayUsage[]>([]);
  const [tokenBreakdown, setTokenBreakdown] = useState<TokenBreakdown[]>([]);
  const [bySource, setBySource] = useState<SourceUsage[]>([]);
  const [chartView, setChartView] = useState<string>('requests');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    const dayMap: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, 'all': 365 };
    const days = dayMap[period] || 7;
    const promises: Promise<any>[] = [
      getUsageStatsAction(period),
      getUsageByModelAction(period),
      getUsageByDayAction(days),
    ];
    if (getTokenBreakdownByDayAction) promises.push(getTokenBreakdownByDayAction(days));
    if (getUsageBySourceAction) promises.push(getUsageBySourceAction(period));
    Promise.all(promises)
      .then(([s, m, d, tb, src]) => {
        setStats(s);
        setByModel(m);
        setByDay(d);
        if (tb) setTokenBreakdown(tb);
        if (src) setBySource(src);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <>
      {/* Period selector */}
      <div className="flex gap-2 mb-6">
        {PERIODS.map((p) => (
          <FilterChip
            key={p.id}
            label={p.label}
            active={period === p.id}
            onClick={() => setPeriod(p.id)}
          />
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
            <StatCard label="Total Requests" value={stats?.totalRequests || 0} accentIndex={0} />
            <StatCard
              label="Total Tokens"
              value={formatTokens(stats?.totalTokens || 0)}
              sub={`${formatTokens(stats?.totalPromptTokens || 0)} in / ${formatTokens(stats?.totalCompletionTokens || 0)} out`}
              accentIndex={1}
            />
            <StatCard label="Est. Cost" value={formatCost(stats?.totalCostUsd || 0)} accentIndex={2} />
            <StatCard label="Avg Latency" value={formatDuration(stats?.avgDurationMs)} accentIndex={3} />
          </div>

          {/* Tabbed daily chart */}
          <div className="rounded-xl border bg-card p-4 shadow-xs mb-6">
            <div className="flex items-center gap-2 mb-4">
              {CHART_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setChartView(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    chartView === tab.id
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <BarChart
              data={byDay.map((d) => ({
                label: d.day?.slice(5) || '',
                value: chartView === 'requests' ? Number(d.requests)
                     : chartView === 'tokens' ? Number(d.totalTokens)
                     : Number(d.totalCost),
              }))}
              color={CHART_TABS.find((t) => t.id === chartView)?.color || 'emerald'}
              formatValue={
                chartView === 'tokens' ? formatTokens
                : chartView === 'cost' ? formatCost
                : undefined
              }
            />
          </div>

          {/* Token breakdown */}
          {tokenBreakdown.length > 0 && (
            <div className="rounded-xl border bg-card p-4 shadow-xs mb-6">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Token Breakdown by Day</p>
              <TokenBreakdownBars data={tokenBreakdown} />
            </div>
          )}

          {/* Model donut + Source bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {byModel.length > 0 && (
              <div className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Model Distribution</p>
                <DonutChart
                  data={byModel.map((m) => ({
                    label: m.model,
                    value: Number(m.requests),
                  }))}
                />
              </div>
            )}
            {bySource.length > 0 && (
              <div className="rounded-xl border bg-card p-4 shadow-xs">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Source Breakdown</p>
                <SourceBreakdownBars data={bySource} />
              </div>
            )}
          </div>

          {/* Model table */}
          {byModel.length > 0 && (
            <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b">
                <p className="text-sm font-semibold">Usage by Model</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left px-4 py-2.5 font-medium">Model</th>
                    <th className="text-left px-4 py-2.5 font-medium">Provider</th>
                    <th className="text-right px-4 py-2.5 font-medium">Requests</th>
                    <th className="text-right px-4 py-2.5 font-medium">Tokens</th>
                    <th className="text-right px-4 py-2.5 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs">{row.model}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.provider}</td>
                      <td className="px-4 py-2.5 text-right">{row.requests}</td>
                      <td className="px-4 py-2.5 text-right">{formatTokens(Number(row.totalTokens))}</td>
                      <td className="px-4 py-2.5 text-right">{formatCost(Number(row.totalCost))}</td>
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
