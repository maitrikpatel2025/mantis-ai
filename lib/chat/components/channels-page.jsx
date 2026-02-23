'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshIcon, SpinnerIcon } from './icons.js';

const CHANNEL_TYPE_LABELS = {
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
};

function ChannelCard({ channel }) {
  return (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full ${
            channel.enabled ? 'bg-green-500' : 'bg-muted-foreground'
          }`}
        />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {CHANNEL_TYPE_LABELS[channel.type] || channel.type}
            </span>
            <span className="text-xs text-muted-foreground">{channel.id}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {channel.webhook_path}
          </p>
        </div>
      </div>
      <span
        className={`text-xs px-2 py-1 rounded-full ${
          channel.enabled
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {channel.enabled ? 'Active' : 'Disabled'}
      </span>
    </div>
  );
}

export function ChannelsPage({ session, getChannelsList }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Channels</h2>
            <button
              onClick={loadChannels}
              disabled={loading}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {loading ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <SpinnerIcon size={16} />
              <span className="ml-2 text-sm">Loading channels...</span>
            </div>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No channels configured. Edit <code>config/CHANNELS.json</code> to add channels.
            </p>
          ) : (
            <div className="space-y-2">
              {channels.map((channel) => (
                <ChannelCard key={channel.id} channel={channel} />
              ))}
            </div>
          )}

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h3 className="text-sm font-medium mb-2">Setup Commands</h3>
            <div className="space-y-1 text-xs text-muted-foreground font-mono">
              <p>npx mantis-ai setup-slack</p>
              <p>npx mantis-ai setup-discord</p>
              <p>npx mantis-ai setup-whatsapp</p>
            </div>
          </div>
        </div>
      </div>
  );
}
