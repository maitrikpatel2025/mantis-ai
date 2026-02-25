'use client';

import { useState, useEffect } from 'react';
import { KeyIcon, CopyIcon, CheckIcon, TrashIcon, RefreshIcon } from './icons.js';
import { createNewApiKey, getApiKeys, deleteApiKey } from '../actions.js';

function timeAgo(ts: number): string {
  if (!ts) return 'Never';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(ts: number): string {
  if (!ts) return '\u2014';
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface CopyButtonProps {
  text: string;
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground shadow-xs transition-colors"
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab component
// ─────────────────────────────────────────────────────────────────────────────

interface TabProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function Tab({ label, active, onClick }: TabProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
        active
          ? 'border-emerald-500 text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// API Key section
// ─────────────────────────────────────────────────────────────────────────────

interface ApiKeyInfo {
  keyPrefix: string;
  createdAt: number;
  lastUsedAt?: number;
}

function ApiKeySection() {
  const [currentKey, setCurrentKey] = useState<ApiKeyInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadKey = async () => {
    try {
      const result = await getApiKeys() as ApiKeyInfo | null;
      setCurrentKey(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKey();
  }, []);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    setConfirmRegenerate(false);
    try {
      const result = await createNewApiKey();
      if (result.error) {
        setError(result.error);
      } else {
        setNewKey(result.key ?? null);
        await loadKey();
      }
    } catch {
      setError('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      await deleteApiKey();
      setCurrentKey(null);
      setNewKey(null);
      setConfirmDelete(false);
    } catch {
      // ignore
    }
  };

  const handleRegenerate = () => {
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      setTimeout(() => setConfirmRegenerate(false), 3000);
      return;
    }
    handleCreate();
  };

  if (loading) {
    return <div className="h-14 animate-pulse rounded-md bg-border/50" />;
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        Authenticates external requests to /api endpoints. Pass via the x-api-key header.
      </p>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      {/* New key banner */}
      {newKey && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 mb-4 animate-fade-in">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              API key created — copy it now. You won't be able to see it again.
            </p>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all select-all">
              {newKey}
            </code>
            <CopyButton text={newKey} />
          </div>
        </div>
      )}

      {currentKey ? (
        <div className="rounded-xl border bg-card shadow-xs p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
                <KeyIcon size={16} />
              </div>
              <div>
                <code className="text-sm font-mono">{currentKey.keyPrefix}...</code>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Created {formatDate(currentKey.createdAt)}
                  {currentKey.lastUsedAt && (
                    <span className="ml-2">&middot; Last used {timeAgo(currentKey.lastUsedAt)}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRegenerate}
                disabled={creating}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                  confirmRegenerate
                    ? 'border-amber-500 text-amber-600 hover:bg-amber-500/10'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                } disabled:opacity-50`}
              >
                <RefreshIcon size={12} />
                {creating ? 'Generating...' : confirmRegenerate ? 'Confirm regenerate' : 'Regenerate'}
              </button>
              <button
                onClick={handleDelete}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                  confirmDelete
                    ? 'border-destructive text-destructive hover:bg-destructive/10'
                    : 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/50'
                }`}
              >
                <TrashIcon size={12} />
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-6 flex flex-col items-center text-center">
          <p className="text-sm text-muted-foreground mb-3">No API key configured</p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {creating ? 'Creating...' : 'Create API key'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsSecretsPage() {
  const [activeTab, setActiveTab] = useState<string>('api-keys');

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-0 border-b mb-6">
        <Tab label="API Keys" active={activeTab === 'api-keys'} onClick={() => setActiveTab('api-keys')} />
        <Tab label="Secrets" active={activeTab === 'secrets'} onClick={() => setActiveTab('secrets')} />
        <Tab label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
      </div>

      {activeTab === 'api-keys' && (
        <ApiKeySection />
      )}

      {activeTab === 'secrets' && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Environment secrets are managed through your <code className="font-mono">.env</code> file and GitHub secrets.
          </p>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Agent settings are configured in <code className="font-mono">config/</code> files.
          </p>
        </div>
      )}
    </div>
  );
}
