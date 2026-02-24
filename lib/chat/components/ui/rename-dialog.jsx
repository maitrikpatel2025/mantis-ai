'use client';

import { useState, useEffect, useRef } from 'react';

export function RenameDialog({ open, onSave, onCancel, title = 'Rename chat', currentValue = '' }) {
  const [value, setValue] = useState(currentValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue(currentValue);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
    }
  }, [open, currentValue]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onCancel]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== currentValue) {
      onSave(trimmed);
    }
    onCancel();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-50 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          className="mt-3 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm font-medium border border-input bg-background hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 shadow-xs transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
