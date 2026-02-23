'use client';

import { useEffect, useCallback } from 'react';
import { XIcon } from '../icons.js';

export function Modal({ open, onClose, title, children }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Card */}
      <div className="relative z-10 bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-medium">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
            <XIcon size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
