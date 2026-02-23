'use client';

import { useState, useEffect } from 'react';
import { SpinnerIcon, UsersIcon, MessageIcon } from './icons.js';

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

export function SessionsPage({ getActiveSessionsAction }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = () => {
    getActiveSessionsAction()
      .then((data) => setSessions(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 15000);
    return () => clearInterval(interval);
  }, []);

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
          <div className="flex flex-col gap-3">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 rounded-md bg-muted p-2">
                      <MessageIcon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.title || 'Untitled'}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                          {s.userId === 'telegram' ? 'Telegram' : 'Web'}
                        </span>
                        <span>{s.messageCount} message{s.messageCount !== 1 ? 's' : ''}</span>
                        <span>{formatDuration(s.createdAt, s.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {timeAgo(s.updatedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
