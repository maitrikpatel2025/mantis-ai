'use client';

import { useState, useEffect, useRef } from 'react';
import { SpinnerIcon, FileTextIcon, TrashIcon, CopyIcon, RefreshIcon } from './icons.js';

const LEVELS = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
];

const levelColors = {
  info: 'bg-blue-500/10 text-blue-500',
  warn: 'bg-yellow-500/10 text-yellow-500',
  error: 'bg-red-500/10 text-red-500',
};

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return `${Math.round(diff / 3600000)}h ago`;
}

export function LogsPage({ getLogsAction, clearLogsAction }) {
  const [logs, setLogs] = useState([]);
  const [level, setLevel] = useState('all');
  const [source, setSource] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  const fetchLogs = () => {
    getLogsAction({ level: level === 'all' ? undefined : level, source: source || undefined })
      .then((data) => {
        setLogs(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, [level, source]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, level, source]);

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
        <div className="flex gap-1">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLevel(l.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                level === l.id
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Filter by text..."
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-md border bg-background text-foreground w-48"
        />
        <div className="flex items-center gap-2 ml-auto">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button onClick={handleCopyAll} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Copy all">
            <CopyIcon size={14} />
          </button>
          <button onClick={handleClear} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Clear logs">
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
        <div ref={scrollRef} className="rounded-lg border bg-card overflow-auto max-h-[60vh] font-mono text-xs">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1.5 border-b last:border-0 hover:bg-accent/30">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${levelColors[log.level] || levelColors.info}`}>
                {log.level}
              </span>
              <span className="text-muted-foreground shrink-0 w-14">{timeAgo(log.timestamp)}</span>
              <span className="break-all whitespace-pre-wrap">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
