'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowUpCircleIcon, SpinnerIcon, CheckIcon, XIcon } from './icons.js';
import { triggerUpgrade } from '../actions.js';

export function UpgradeDialog({ open, onClose, version, updateAvailable }) {
  const [upgrading, setUpgrading] = useState(false);
  const [result, setResult] = useState(null);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) {
      setUpgrading(false);
      setResult(null);
    }
  }, [open]);

  if (!open) return null;

  const handleUpgrade = async () => {
    setUpgrading(true);
    setResult(null);
    try {
      await triggerUpgrade();
      setResult('success');
    } catch {
      setResult('error');
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative z-50 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold tracking-tight">Upgrade Available</h3>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <ArrowUpCircleIcon size={24} />
          <div>
            <p className="text-sm text-muted-foreground">Installed version</p>
            <p className="text-lg font-mono font-semibold tracking-tight">v{version}</p>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 mb-4">
          <p className="text-sm font-medium">
            Version <span className="font-mono text-emerald-600 dark:text-emerald-400">v{updateAvailable}</span> is available
          </p>
        </div>

        <button
          onClick={handleUpgrade}
          disabled={upgrading || result === 'success'}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {upgrading ? (
            <>
              <SpinnerIcon size={16} />
              Triggering upgrade...
            </>
          ) : result === 'success' ? (
            <>
              <CheckIcon size={16} />
              Upgrade triggered
            </>
          ) : (
            <>
              <ArrowUpCircleIcon size={16} />
              Upgrade to v{updateAvailable}
            </>
          )}
        </button>

        {result === 'success' && (
          <p className="text-xs text-muted-foreground mt-3">
            The upgrade workflow has been triggered. The server will update, rebuild, and reload automatically.
          </p>
        )}
        {result === 'error' && (
          <p className="text-xs text-destructive mt-3">
            Failed to trigger the upgrade workflow. Check that your GitHub token has workflow permissions.
          </p>
        )}
      </div>
    </div>
  );
}
