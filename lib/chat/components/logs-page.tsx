'use client';

import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { SpinnerIcon, FileTextIcon, TrashIcon, CopyIcon, RefreshIcon } from './icons.js';
import { useEventStream } from '../../events/use-event-stream.js';

interface LogEntry {
  level: string;
  message?: string;
  timestamp: number;
}

interface LogFilter {
  level?: string;
  source?: string;
}

const LEVELS = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
];

const levelColors: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return `${Math.round(diff / 3600000)}h ago`;
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

interface LogsPageProps {
  getLogsAction: (filter: LogFilter) => Promise<LogEntry[]>;
  clearLogsAction: () => Promise<void>;
}

export function LogsPage({ getLogsAction, clearLogsAction }: LogsPageProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<string>('all');
  const [source, setSource] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = () => {
    getLogsAction({ level: level === 'all' ? undefined : level, source: source || undefined })
      .then((data) => {
        setLogs(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(); }, [level, source]);

  // SSE: append new log entries in real-time
  useEventStream('log', useCallback((data: LogEntry) => {
    if (!autoRefresh) return;
    // Apply client-side level filter
    if (level !== 'all' && data.level !== level) return;
    // Apply client-side text filter
    if (source && !data.message?.toLowerCase().includes(source.toLowerCase())) return;
    setLogs((prev) => [...prev, data]);
  }, [autoRefresh, level, source]));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopyAll = () => {
    const text = logs.map((l) => `[${l.level.toUpperCase()}] ${new Date(l.timestamp).toISOString()} ${l.message}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleClear = async () => {
    await clearLogsAction();
    setLogs([]);
  };

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          {LEVELS.map((l) => (
            <FilterChip
              key={l.id}
              label={l.label}
              active={level === l.id}
              onClick={() => setLevel(l.id)}
            />
          ))}
        </div>
        <input
          type="text"
          placeholder="Filter by text..."
          value={source}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSource(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-input bg-transparent text-foreground w-48 shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
        />
        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button onClick={handleCopyAll} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors" title="Copy all">
            <CopyIcon size={14} />
          </button>
          <button onClick={handleClear} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive transition-colors" title="Clear logs">
            <TrashIcon size={14} />
          </button>
        </div>
      </div>

      {/* Log entries */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <SpinnerIcon size={20} />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileTextIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No logs captured</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Console output from the event handler will appear here.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="rounded-xl border bg-card shadow-xs overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium w-16">Level</th>
                <th className="text-left px-3 py-2 font-medium w-20">Time</th>
                <th className="text-left px-3 py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody className="max-h-[60vh] overflow-auto">
              {logs.map((log, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="px-3 py-1.5">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${levelColors[log.level] || levelColors.info}`}>
                      {log.level}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{timeAgo(log.timestamp)}</td>
                  <td className="px-3 py-1.5 break-all whitespace-pre-wrap">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
