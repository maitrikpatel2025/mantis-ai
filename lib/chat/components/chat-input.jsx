'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { SendIcon, StopIcon, PaperclipIcon, XIcon, FileTextIcon } from './icons.js';
import { cn } from '../utils.js';

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css',
  'text/javascript', 'text/x-python', 'text/x-typescript',
  'application/json',
];

const MAX_FILES = 5;

function isAcceptedType(file) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  // Fall back to extension for files with generic MIME types
  const ext = file.name?.split('.').pop()?.toLowerCase();
  const textExts = ['txt', 'md', 'csv', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'yml', 'yaml', 'xml', 'sh', 'bash', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp'];
  return textExts.includes(ext);
}

function getEffectiveType(file) {
  if (ACCEPTED_TYPES.includes(file.type) && file.type !== '') return file.type;
  const ext = file.name?.split('.').pop()?.toLowerCase();
  const extMap = {
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    json: 'application/json', js: 'text/javascript', ts: 'text/x-typescript',
    jsx: 'text/javascript', tsx: 'text/x-typescript', py: 'text/x-python',
    html: 'text/html', css: 'text/css', yml: 'text/plain', yaml: 'text/plain',
    xml: 'text/plain', sh: 'text/plain', bash: 'text/plain', rb: 'text/plain',
    go: 'text/plain', rs: 'text/plain', java: 'text/plain', c: 'text/plain',
    cpp: 'text/plain', h: 'text/plain', hpp: 'text/plain',
  };
  return extMap[ext] || file.type || 'text/plain';
}

function ModelSelector({ model, setModel, catalog }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!catalog?.available?.length) return null;

  const currentLabel = model
    ? catalog.available.find((m) => m.id === model)?.label || model
    : 'Default';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/></svg>
        {currentLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border border-border bg-background shadow-lg z-50">
          <button
            type="button"
            onClick={() => { setModel(null); setOpen(false); }}
            className={cn(
              'w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors first:rounded-t-lg',
              !model && 'text-foreground font-medium'
            )}
          >
            Default (env)
          </button>
          {catalog.available.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { setModel(m.id); setOpen(false); }}
              className={cn(
                'w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors last:rounded-b-lg',
                model === m.id && 'text-foreground font-medium'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatInput({ input, setInput, onSubmit, status, stop, files, setFiles, model, setModel, modelsCatalog }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const isStreaming = status === 'streaming' || status === 'submitted';

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleFiles = useCallback((fileList) => {
    const newFiles = Array.from(fileList).filter(isAcceptedType);
    if (newFiles.length === 0) return;

    // Read files outside state updater to avoid React strict mode double-invocation
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setFiles((current) => {
          if (current.length >= MAX_FILES) return current;
          return [...current, { file, previewUrl: reader.result }];
        });
      };
      reader.readAsDataURL(file);
    });
  }, [setFiles]);

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if ((!input.trim() && files.length === 0) || isStreaming) return;
    onSubmit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const canSend = input.trim() || files.length > 0;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-4 md:px-6">
      <form onSubmit={handleSubmit} className="relative">
        <div
          className={cn(
            'flex flex-col rounded-xl border bg-card shadow-sm p-2 transition-all',
            isDragging ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* File preview strip */}
          {files.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto px-1 py-1">
              {files.map((f, i) => {
                const isImage = f.file.type.startsWith('image/');
                return (
                  <div key={i} className="group relative flex-shrink-0">
                    {isImage ? (
                      <img
                        src={f.previewUrl}
                        alt={f.file.name}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 items-center gap-1.5 rounded-lg bg-foreground/10 px-3">
                        <FileTextIcon size={14} />
                        <span className="max-w-[100px] truncate text-xs">
                          {f.file.name}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-foreground p-0.5 text-background group-hover:flex items-center justify-center"
                      aria-label={`Remove ${f.file.name}`}
                    >
                      <XIcon size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Paperclip button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground"
              aria-label="Attach files"
              disabled={isStreaming}
            >
              <PaperclipIcon size={16} />
            </button>

            {/* Model selector */}
            <ModelSelector model={model} setModel={setModel} catalog={modelsCatalog} />

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,text/*,application/json,.md,.csv,.json,.js,.ts,.jsx,.tsx,.py,.html,.css,.yml,.yaml,.xml,.sh,.rb,.go,.rs,.java,.c,.cpp,.h"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              rows={1}
              className={cn(
                'flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground',
                'placeholder:text-muted-foreground focus:outline-none',
                'max-h-[200px]'
              )}
              disabled={isStreaming}
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center justify-center rounded-lg bg-foreground p-2 text-background hover:opacity-80"
                aria-label="Stop generating"
              >
                <StopIcon size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className={cn(
                  'inline-flex items-center justify-center rounded-lg p-2',
                  canSend
                    ? 'bg-foreground text-background hover:opacity-80'
                    : 'bg-muted-foreground/20 text-muted-foreground cursor-not-allowed'
                )}
                aria-label="Send message"
              >
                <SendIcon size={16} />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
