'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshIcon, SpinnerIcon, BroadcastIcon } from './icons.js';
import { useEventStream } from '../../events/use-event-stream.js';

interface Channel {
  id: string;
  type: string;
  enabled: boolean;
  webhook_path?: string;
}

interface ChannelMetrics {
  inbound: number;
  outbound: number;
  lastMessageAt?: number;
}

interface ChannelMessageEvent {
  channelId?: string;
  inbound?: number;
  outbound?: number;
  lastMessageAt?: number;
}

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
};

const CHANNEL_TYPE_COLORS: Record<string, string> = {
  telegram: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  slack: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  discord: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  whatsapp: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

function formatTimeAgo(ts: number | undefined): string | null {
  if (!ts) return null;
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

interface ChannelCardProps {
  channel: Channel;
  metrics?: ChannelMetrics;
}

function ChannelCard({ channel, metrics }: ChannelCardProps) {
  const disabled = !channel.enabled;
  const m = metrics || {} as ChannelMetrics;
  const recentlyActive = m.lastMessageAt && (Date.now() - m.lastMessageAt) < 60000;

  return (
    <div className={`rounded-xl border bg-card shadow-xs transition-all hover:shadow-md ${disabled ? 'opacity-60' : ''}`}>
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 rounded-lg bg-blue-500/10 p-2.5 text-blue-600 dark:text-blue-400">
              <BroadcastIcon size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {CHANNEL_TYPE_LABELS[channel.type] || channel.type}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{channel.id}</p>
            </div>
          </div>
          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full mt-1.5 ${
            disabled ? 'bg-stone-300 dark:bg-stone-600' :
            recentlyActive ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'
          }`} />
        </div>

        {/* Badges */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHANNEL_TYPE_COLORS[channel.type] || 'bg-muted text-muted-foreground'}`}>
            {channel.type}
          </span>
          {channel.webhook_path && (
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted">
              {channel.webhook_path}
            </span>
          )}
        </div>
      </div>

      {/* Metrics + Footer */}
      <div className="border-t px-4 py-2.5">
        {(m.inbound > 0 || m.outbound > 0) ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{m.inbound || 0}</span> in
              </span>
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{m.outbound || 0}</span> out
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {m.lastMessageAt ? formatTimeAgo(m.lastMessageAt) : ''}
            </span>
          </div>
        ) : (
          <span className={`text-xs font-medium ${disabled ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {disabled ? 'Disabled' : 'Active'}
          </span>
        )}
      </div>
    </div>
  );
}

interface ChannelsPageProps {
  session: any;
  getChannelsList: () => Promise<Channel[]>;
  getChannelMetricsAction?: () => Promise<Record<string, ChannelMetrics>>;
}

export function ChannelsPage({ session, getChannelsList, getChannelMetricsAction }: ChannelsPageProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [metrics, setMetrics] = useState<Record<string, ChannelMetrics>>({});
  const [loading, setLoading] = useState<boolean>(true);

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getChannelsList();
      setChannels(result || []);
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setLoading(false);
    }
  }, [getChannelsList]);

  const loadMetrics = useCallback(async () => {
    if (!getChannelMetricsAction) return;
    try {
      const result = await getChannelMetricsAction();
      setMetrics(result || {});
    } catch {}
  }, [getChannelMetricsAction]);

  useEffect(() => {
    loadChannels();
    loadMetrics();
  }, [loadChannels, loadMetrics]);

  // Live update metrics on channel message
  useEventStream('channel:message', useCallback((data: ChannelMessageEvent) => {
    if (data?.channelId) {
      setMetrics((prev) => ({
        ...prev,
        [data.channelId!]: {
          inbound: data.inbound || prev[data.channelId!]?.inbound || 0,
          outbound: data.outbound || prev[data.channelId!]?.outbound || 0,
          lastMessageAt: data.lastMessageAt || Date.now(),
        },
      }));
    }
  }, []));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted-foreground">
          {!loading && `${channels.length} channel${channels.length !== 1 ? 's' : ''} configured`}
        </p>
        <button
          onClick={() => { loadChannels(); loadMetrics(); }}
          disabled={loading}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-border/50" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <BroadcastIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No channels configured</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Edit <code className="font-mono">config/CHANNELS.json</code> to add channels.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              metrics={metrics[channel.id]}
            />
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-muted/50 rounded-xl">
        <h3 className="text-sm font-medium mb-2">Setup Commands</h3>
        <div className="space-y-1 text-xs text-muted-foreground font-mono">
          <p>npx mantis-ai setup-slack</p>
          <p>npx mantis-ai setup-discord</p>
          <p>npx mantis-ai setup-whatsapp</p>
        </div>
      </div>
    </div>
  );
}
