'use client';

import { useState, useEffect } from 'react';
import { XIcon, ArrowUpCircleIcon } from './icons.js';
import { getAppVersion, triggerUpgrade } from '../actions.js';

export function UpdateBanner() {
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('update-banner-dismissed')) {
      setDismissed(true);
      return;
    }
    getAppVersion()
      .then(({ updateAvailable }) => {
        if (updateAvailable) setUpdate(updateAvailable);
      })
      .catch(() => {});
  }, []);

  if (!update || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('update-banner-dismissed', '1'); } catch {}
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      await triggerUpgrade();
    } catch {}
    setUpgrading(false);
  };

  return (
    <div className="bg-emerald-600 dark:bg-emerald-700 text-white px-4 py-2.5 text-sm flex items-center justify-between">
      <div className="flex items-center gap-2">
        <ArrowUpCircleIcon size={16} />
        <span>Update available: <strong className="font-semibold">v{update}</strong></span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleUpgrade}
          disabled={upgrading}
          className="px-3 py-1 text-xs font-medium rounded-md bg-white/20 hover:bg-white/30 disabled:opacity-50 transition-colors"
        >
          {upgrading ? 'Updating...' : 'Update Now'}
        </button>
        <button onClick={handleDismiss} className="p-1 rounded-md hover:bg-white/20 transition-colors">
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}
