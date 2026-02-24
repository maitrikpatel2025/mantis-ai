'use client';

import { useState, useEffect, useCallback } from 'react';
import { SpinnerIcon, UsersIcon } from './icons.js';
import { useEventStream } from '../../events/use-event-stream.js';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function formatDuration(startTs, endTs) {
  const diff = (endTs || Date.now()) - startTs;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function SessionsPage({ getActiveSessionsAction }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = () => {
    getActiveSessionsAction()
      .then((data) => setSessions(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchSessions(); }, []);

  // SSE: refetch on activity events
  useEventStream('job:created', useCallback(() => fetchSessions(), []));
  useEventStream('notification', useCallback(() => fetchSessions(), []));

  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <SpinnerIcon size={20} />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <UsersIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No active sessions</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Chats updated in the last 30 minutes will appear here.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
          </p>
          <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Client</th>
                  <th className="text-left px-4 py-2.5 font-medium">Channel</th>
                  <th className="text-right px-4 py-2.5 font-medium">Messages</th>
                  <th className="text-left px-4 py-2.5 font-medium">Connected</th>
                  <th className="text-left px-4 py-2.5 font-medium">Last Active</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const isActive = s.updatedAt && (Date.now() - s.updatedAt) < 300000; // 5min
                  return (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-medium truncate max-w-[200px]">{s.title || 'Untitled'}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
                          {s.userId === 'telegram' ? 'Telegram' : 'Web'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{s.messageCount}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatTime(s.createdAt)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{timeAgo(s.updatedAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                          {isActive ? 'Active' : 'Idle'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
