'use client';

import React, { useState, useCallback } from 'react';
import { useEventStream } from '../../events/use-event-stream.js';
import { XIcon, CheckIcon } from './icons.js';

const MAX_TOASTS = 3;

const TOAST_STYLES: Record<string, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
};

interface ToastData {
  id: number;
  variant?: string;
  title: string;
  message?: string;
  href?: string;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: number) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm animate-slide-in-right cursor-pointer transition-opacity hover:opacity-90 ${TOAST_STYLES[toast.variant || 'info'] || TOAST_STYLES.info}`}
      onClick={() => {
        if (toast.href) window.location.href = toast.href;
        onDismiss(toast.id);
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{toast.title}</p>
        {toast.message && (
          <p className="text-xs opacity-80 mt-0.5 truncate">{toast.message}</p>
        )}
      </div>
      <button
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDismiss(toast.id); }}
        className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        <XIcon size={12} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      const next = [...prev, { ...toast, id }];
      return next.slice(-MAX_TOASTS);
    });
    // Auto-dismiss after 5s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Skip job toasts when user is already on the jobs page — they can see updates directly
  const isOnJobsPage = () => window.location.pathname.startsWith('/settings/jobs') || window.location.pathname === '/swarm';

  // Listen for job completion
  useEventStream('job:completed', useCallback((data: any) => {
    if (isOnJobsPage()) return;
    addToast({
      variant: 'success',
      title: 'Job completed',
      message: data?.summary ? data.summary.slice(0, 80) : `Job ${data?.id?.slice(0, 8) || ''}`,
      href: '/settings/jobs',
    });
  }, [addToast]));

  // Listen for job failures
  useEventStream('job:failed', useCallback((data: any) => {
    if (isOnJobsPage()) return;
    addToast({
      variant: 'error',
      title: 'Job failed',
      message: data?.error ? data.error.slice(0, 80) : `Job ${data?.id?.slice(0, 8) || ''}`,
      href: '/settings/jobs',
    });
  }, [addToast]));

  // Listen for job:updated with terminal status (covers cancelJobAction which uses updateJob directly)
  useEventStream('job:updated', useCallback((data: any) => {
    if (isOnJobsPage()) return;
    if (data?.status === 'completed') {
      addToast({
        variant: 'success',
        title: 'Job completed',
        message: data?.summary ? data.summary.slice(0, 80) : `Job ${data?.id?.slice(0, 8) || ''}`,
        href: '/settings/jobs',
      });
    } else if (data?.status === 'failed') {
      addToast({
        variant: 'error',
        title: 'Job failed',
        message: data?.error ? data.error.slice(0, 80) : `Job ${data?.id?.slice(0, 8) || ''}`,
        href: '/settings/jobs',
      });
    }
  }, [addToast]));

  // Notifications always show — they're external events the user hasn't seen
  useEventStream('notification', useCallback((data: any) => {
    addToast({
      variant: 'info',
      title: 'New notification',
      message: data?.notification?.slice(0, 80) || '',
      href: '/notifications',
    });
  }, [addToast]));

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  );
}
