'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClockIcon, SpinnerIcon, ChevronDownIcon, PlusIcon, PencilIcon, TrashIcon, CheckIcon, XIcon } from './icons.js';
import { getSwarmConfig, createCron, updateCron, deleteCron, toggleCronEnabled, getCronRunsAction, getCronRunStatsAction } from '../actions.js';
import { Modal } from './ui/modal.js';
import { ConfirmDialog } from './ui/confirm-dialog.js';
import { useEventStream } from '../../events/use-event-stream.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function describeCron(schedule) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(minute.slice(2), 10);
    if (n === 1) return 'Every minute';
    return `Every ${n} minutes`;
  }

  if (hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = parseInt(hour.slice(2), 10);
    if (n === 1) return 'Every hour';
    return `Every ${n} hours`;
  }

  if (minute !== '*' && hour !== '*' && !hour.includes('/') && !minute.includes('/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Daily at ${displayH}:${String(m).padStart(2, '0')} ${period}`;
  }

  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const dayNames = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat' };
    const days = dayOfWeek.split(',').map(d => dayNames[d] || d).join(', ');
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${days} at ${displayH}:${String(m).padStart(2, '0')} ${period}`;
  }

  return schedule;
}

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const typeBadgeStyles = {
  agent: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  command: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  webhook: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
};

const typeOrder = { agent: 0, command: 1, webhook: 2 };

function sortByType(items) {
  return [...items].sort((a, b) => {
    const ta = typeOrder[a.type || 'agent'] ?? 99;
    const tb = typeOrder[b.type || 'agent'] ?? 99;
    return ta - tb;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Form Modal
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', schedule: '', type: 'agent', job: '', command: '', url: '', method: 'POST', enabled: true };

function CronFormModal({ open, onClose, onSubmit, initial, title }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
      setError('');
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const result = await onSubmit(form);
    setSaving(false);
    if (result?.success) {
      onClose();
    } else {
      setError(result?.message || 'Failed to save');
    }
  };

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} title={title || 'Add Cron Job'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Schedule (cron expression)</label>
          <input
            type="text"
            value={form.schedule}
            onChange={(e) => set('schedule', e.target.value)}
            placeholder="*/30 * * * *"
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
            required
          />
          {form.schedule && (
            <p className="text-xs text-muted-foreground mt-1">{describeCron(form.schedule)}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <select
            value={form.type}
            onChange={(e) => set('type', e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
          >
            <option value="agent">Agent</option>
            <option value="command">Command</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>

        {form.type === 'agent' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Job prompt</label>
            <textarea
              value={form.job || ''}
              onChange={(e) => set('job', e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono min-h-[80px] shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
            />
          </div>
        )}

        {form.type === 'command' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Command</label>
            <input
              type="text"
              value={form.command || ''}
              onChange={(e) => set('command', e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
            />
          </div>
        )}

        {form.type === 'webhook' && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">URL</label>
              <input
                type="url"
                value={form.url || ''}
                onChange={(e) => set('url', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Method</label>
              <select
                value={form.method || 'POST'}
                onChange={(e) => set('method', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
          </>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-input hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Group Header
// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-foreground text-background'
          : 'bg-muted text-muted-foreground hover:bg-accent'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`text-[10px] ${active ? 'opacity-70' : ''}`}>{count}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Run History
// ─────────────────────────────────────────────────────────────────────────────

function CronRunHistory({ cronName }) {
  const [runs, setRuns] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCronRunsAction(cronName, 10)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [cronName]);

  // Live updates
  useEventStream('cron:run', useCallback((data) => {
    if (data?.cronName === cronName) {
      setRuns((prev) => prev ? [data, ...prev].slice(0, 10) : [data]);
    }
  }, [cronName]));

  if (loading) return <div className="py-2 text-xs text-muted-foreground">Loading history...</div>;
  if (!runs || runs.length === 0) return <div className="py-2 text-xs text-muted-foreground">No runs recorded yet</div>;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Runs</p>
      {runs.map((run) => (
        <div key={run.id} className="flex items-center gap-2 text-xs py-1">
          <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${run.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-muted-foreground font-mono shrink-0">
            {new Date(run.startedAt).toLocaleTimeString()}
          </span>
          <span className="text-muted-foreground shrink-0">{formatDuration(run.durationMs)}</span>
          {run.error && (
            <span className="text-red-500 truncate" title={run.error}>{run.error}</span>
          )}
          {run.status === 'success' && run.output && (
            <span className="text-muted-foreground truncate" title={run.output}>{run.output}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Card
// ─────────────────────────────────────────────────────────────────────────────

function CronCard({ cron, index, stats, onEdit, onDelete, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const type = cron.type || 'agent';
  const disabled = cron.enabled === false;
  const cronStats = stats?.[cron.name];

  const successRate = cronStats && cronStats.total > 0
    ? Math.round((cronStats.success / cronStats.total) * 100)
    : null;

  return (
    <div className={`rounded-xl border bg-card shadow-xs transition-all hover:shadow-md ${disabled ? 'opacity-60' : ''}`}>
      {/* Card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
              <ClockIcon size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{cron.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{describeCron(cron.schedule)}</p>
            </div>
          </div>
          <button
            onClick={() => onToggle(index)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              disabled ? 'bg-stone-300 dark:bg-stone-600' : 'bg-emerald-500'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${disabled ? 'translate-x-0.5' : 'translate-x-[18px]'}`} />
          </button>
        </div>

        {/* Type badge + stats */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadgeStyles[type] || typeBadgeStyles.agent}`}>
            {type}
          </span>
          {successRate !== null && (
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${
              successRate >= 90 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
              successRate >= 50 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
              'bg-red-500/10 text-red-600 dark:text-red-400'
            }`}>
              {successRate}% success
            </span>
          )}
          {cronStats?.lastRunAt && (
            <span className="text-[10px] text-muted-foreground">
              {formatTimeAgo(cronStats.lastRunAt)}
            </span>
          )}
          {cronStats?.avgDurationMs != null && (
            <span className="text-[10px] text-muted-foreground">
              avg {formatDuration(Math.round(cronStats.avgDurationMs))}
            </span>
          )}
        </div>
      </div>

      {/* Divider + actions */}
      <div className="border-t px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(index)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Edit">
            <PencilIcon size={12} />
            <span>Edit</span>
          </button>
          <button onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
            <ChevronDownIcon size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            <span>Details</span>
          </button>
        </div>
        <button onClick={() => onDelete(index)} className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-destructive transition-colors" title="Delete">
          <TrashIcon size={12} />
        </button>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {type === 'agent' && cron.job && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Job prompt</p>
              <pre className="text-xs bg-muted rounded-lg p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">{cron.job}</pre>
            </div>
          )}
          {type === 'command' && cron.command && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Command</p>
              <pre className="text-xs bg-muted rounded-lg p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">{cron.command}</pre>
            </div>
          )}
          {type === 'webhook' && (
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">URL</p>
                <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto">
                  {cron.method && cron.method !== 'POST' ? `${cron.method} ` : ''}{cron.url}
                </pre>
              </div>
            </div>
          )}
          <CronRunHistory cronName={cron.name} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function CronsPage() {
  const [crons, setCrons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({});

  const reload = () => {
    getSwarmConfig()
      .then((data) => {
        if (data?.crons) setCrons(data.crons);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadStats = () => {
    getCronRunStatsAction()
      .then((data) => {
        const map = {};
        for (const s of data) map[s.cronName] = s;
        setStats(map);
      })
      .catch(() => {});
  };

  useEffect(() => {
    reload();
    loadStats();
  }, []);

  // Live update stats on cron run
  useEventStream('cron:run', useCallback(() => {
    loadStats();
  }, []));

  const handleCreate = async (data) => {
    const result = await createCron(data);
    if (result.success) reload();
    return result;
  };

  const handleEdit = async (data) => {
    const result = await updateCron(editIndex, data);
    if (result.success) reload();
    return result;
  };

  const handleDelete = async () => {
    await deleteCron(deleteIndex);
    setDeleteIndex(null);
    reload();
  };

  const handleToggle = async (index) => {
    await toggleCronEnabled(index);
    reload();
  };

  const enabled = sortByType(crons.filter((c) => c.enabled !== false));
  const disabled = sortByType(crons.filter((c) => c.enabled === false));
  const filtered = filter === 'enabled' ? enabled : filter === 'disabled' ? disabled : sortByType(crons);

  // Map sorted items back to their original index
  const getOriginalIndex = (cron) => crons.indexOf(cron);

  return (
    <>
      {/* Header with filters and Add button */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <FilterChip label="All" count={crons.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterChip label="Enabled" count={enabled.length} active={filter === 'enabled'} onClick={() => setFilter('enabled')} />
          <FilterChip label="Disabled" count={disabled.length} active={filter === 'disabled'} onClick={() => setFilter('disabled')} />
        </div>
        <button
          onClick={() => { setEditIndex(null); setFormOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors"
        >
          <PlusIcon size={14} />
          Create Job
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-border/50" />
          ))}
        </div>
      ) : crons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ClockIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No cron jobs configured</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Click "Create Job" to create your first scheduled job.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((cron, i) => (
            <CronCard
              key={`cron-${getOriginalIndex(cron)}`}
              cron={cron}
              index={getOriginalIndex(cron)}
              stats={stats}
              onEdit={(idx) => { setEditIndex(idx); setFormOpen(true); }}
              onDelete={(idx) => setDeleteIndex(idx)}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <CronFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditIndex(null); }}
        onSubmit={editIndex !== null ? handleEdit : handleCreate}
        initial={editIndex !== null ? crons[editIndex] : null}
        title={editIndex !== null ? 'Edit Cron Job' : 'Add Cron Job'}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteIndex !== null}
        onConfirm={handleDelete}
        onCancel={() => setDeleteIndex(null)}
        title="Delete cron job?"
        description={deleteIndex !== null ? `This will permanently remove "${crons[deleteIndex]?.name}".` : ''}
        confirmLabel="Delete"
      />
    </>
  );
}
