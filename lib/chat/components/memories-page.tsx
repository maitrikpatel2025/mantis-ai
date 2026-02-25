'use client';

import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import {
  SpinnerIcon, SearchIcon, PlusIcon, PencilIcon,
  TrashIcon, CheckIcon, XIcon, BrainIcon,
} from './icons.js';
import {
  getMemoriesAction, searchMemoriesAction,
  createMemoryAction, updateMemoryAction, deleteMemoryAction,
} from '../actions.js';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface Memory {
  id: string;
  content: string;
  category: string;
  relevance: number;
  sourceJobId?: string;
  createdAt?: number;
}

interface MemoryUpdateFields {
  content: string;
  category: string;
  relevance: number;
}

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const CATEGORIES = ['all', 'general', 'project', 'skill', 'preference', 'lesson'];

const CATEGORY_STYLES: Record<string, string> = {
  general: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  project: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  skill: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  preference: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  lesson: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

function timeAgo(ts: number | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// -------------------------------------------------------------------------
// Loading Skeleton
// -------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-border/50" />
      ))}
    </div>
  );
}

// -------------------------------------------------------------------------
// Add Memory Modal
// -------------------------------------------------------------------------

interface AddMemoryModalProps {
  onClose: () => void;
  onSave: (content: string, category: string) => Promise<void>;
}

function AddMemoryModal({ onClose, onSave }: AddMemoryModalProps) {
  const [content, setContent] = useState<string>('');
  const [category, setCategory] = useState<string>('general');
  const [saving, setSaving] = useState<boolean>(false);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onSave(content.trim(), category);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-4">Add Memory</h3>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Enter memory content..."
          rows={4}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none mb-3"
          autoFocus
        />

        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs text-muted-foreground">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {CATEGORIES.filter((c) => c !== 'all').map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim() || saving}
            className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Memory Card
// -------------------------------------------------------------------------

interface MemoryCardProps {
  memory: Memory;
  onUpdate: (id: string, fields: MemoryUpdateFields) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function MemoryCard({ memory, onUpdate, onDelete }: MemoryCardProps) {
  const [editing, setEditing] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>(memory.content);
  const [editCategory, setEditCategory] = useState<string>(memory.category);
  const [editRelevance, setEditRelevance] = useState<string | number>(memory.relevance);
  const [saving, setSaving] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(memory.id, {
        content: editContent.trim(),
        category: editCategory,
        relevance: parseInt(String(editRelevance), 10),
      });
      setEditing(false);
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await onDelete(memory.id);
  };

  if (editing) {
    return (
      <div className="border border-emerald-500/30 rounded-lg bg-card shadow-xs p-4 space-y-3">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
          autoFocus
        />
        <div className="flex items-center gap-3">
          <select
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none"
          >
            {CATEGORIES.filter((c) => c !== 'all').map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <label className="text-xs text-muted-foreground">Relevance</label>
          <input
            type="number"
            min={1}
            max={10}
            value={editRelevance}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditRelevance(e.target.value)}
            className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none"
          />
          <div className="flex-1" />
          <button onClick={() => setEditing(false)} className="p-1.5 rounded-md hover:bg-accent transition-colors">
            <XIcon size={14} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !editContent.trim()}
            className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
          >
            {saving ? <SpinnerIcon size={14} /> : <CheckIcon size={14} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card shadow-xs p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Category + relevance */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_STYLES[memory.category] || 'bg-muted text-muted-foreground'}`}>
              {memory.category}
            </span>
            <span className="text-[10px] text-muted-foreground">
              relevance: {memory.relevance}/10
            </span>
            {memory.sourceJobId && (
              <span className="text-[10px] text-muted-foreground font-mono">
                job: {memory.sourceJobId.slice(0, 8)}
              </span>
            )}
          </div>

          {/* Content */}
          <p className="text-sm whitespace-pre-wrap">{memory.content}</p>

          {/* Time */}
          <p className="text-[10px] text-muted-foreground mt-1.5">{timeAgo(memory.createdAt)}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setEditContent(memory.content);
              setEditCategory(memory.category);
              setEditRelevance(memory.relevance);
              setEditing(true);
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Edit"
          >
            <PencilIcon size={14} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10 transition-colors"
                title="Confirm delete"
              >
                <CheckIcon size={14} />
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors"
                title="Cancel"
              >
                <XIcon size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
              title="Delete"
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Main Page
// -------------------------------------------------------------------------

interface MemoriesPageProps {
  session: any;
}

export function MemoriesPage({ session }: MemoriesPageProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [showAdd, setShowAdd] = useState<boolean>(false);

  const fetchMemories = useCallback(async () => {
    try {
      const cat = category === 'all' ? undefined : category;
      let result: Memory[];
      if (search.trim()) {
        result = await searchMemoriesAction(search.trim(), cat) as Memory[];
      } else {
        result = await getMemoriesAction(cat) as Memory[];
      }
      setMemories(result || []);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => fetchMemories(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchMemories, search]);

  const handleCreate = async (content: string, cat: string) => {
    const result = await createMemoryAction(content, cat) as { error?: string };
    if (!result.error) {
      await fetchMemories();
    }
  };

  const handleUpdate = async (id: string, fields: MemoryUpdateFields) => {
    const result = await updateMemoryAction(id, fields);
    if (result.success) {
      await fetchMemories();
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deleteMemoryAction(id);
    if (result.success) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
    }
  };

  return (
    <>
      {/* Search + Add */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <SearchIcon size={14} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            style={{ paddingLeft: '2rem' }}
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <SearchIcon size={14} />
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0"
        >
          <PlusIcon size={14} />
          Add Memory
        </button>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {CATEGORIES.map((cat) => {
          const isActive = category === cat;
          return (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setLoading(true); }}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="capitalize">{cat}</span>
            </button>
          );
        })}
      </div>

      {/* Memory list */}
      {loading ? (
        <LoadingSkeleton />
      ) : memories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <BrainIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No memories found</p>
          <p className="text-xs text-muted-foreground">
            {search ? 'Try a different search term.' : 'Memories are created automatically from jobs or manually via the Add button.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {memories.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddMemoryModal
          onClose={() => setShowAdd(false)}
          onSave={handleCreate}
        />
      )}
    </>
  );
}
