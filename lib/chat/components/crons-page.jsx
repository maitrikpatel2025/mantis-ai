'use client';

import { useState, useEffect } from 'react';
import { ClockIcon, SpinnerIcon, ChevronDownIcon, PlusIcon, PencilIcon, TrashIcon } from './icons.js';
import { getSwarmConfig, createCron, updateCron, deleteCron, toggleCronEnabled } from '../actions.js';
import { Modal } from './ui/modal.js';
import { ConfirmDialog } from './ui/confirm-dialog.js';

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

const typeBadgeStyles = {
  agent: 'bg-purple-500/10 text-purple-500',
  command: 'bg-blue-500/10 text-blue-500',
  webhook: 'bg-orange-500/10 text-orange-500',
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
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
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
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
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
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
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
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[80px]"
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
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
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
                className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Method</label>
              <select
                value={form.method || 'POST'}
                onChange={(e) => set('method', e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
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

function GroupHeader({ label, count }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-xs text-muted-foreground">({count})</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Card
// ─────────────────────────────────────────────────────────────────────────────

function CronCard({ cron, index, onEdit, onDelete, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const type = cron.type || 'agent';
  const disabled = cron.enabled === false;

  return (
    <div
      className={`rounded-lg border bg-card transition-opacity ${disabled ? 'opacity-60' : ''}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left p-4 hover:bg-accent/50 rounded-lg"
      >
        <div className="shrink-0 rounded-md bg-muted p-2">
          <ClockIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{cron.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-mono">{cron.schedule}</span>
            <span className="mx-1.5 text-border">|</span>
            {describeCron(cron.schedule)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadgeStyles[type] || typeBadgeStyles.agent}`}>
            {type}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(index); }}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium cursor-pointer ${
              disabled ? 'bg-muted text-muted-foreground' : 'bg-green-500/10 text-green-500'
            }`}
          >
            {disabled ? 'disabled' : 'enabled'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(index); }} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Edit">
            <PencilIcon size={12} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(index); }} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Delete">
            <TrashIcon size={12} />
          </button>
          <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDownIcon size={14} />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3">
          {type === 'agent' && cron.job && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Job prompt</p>
              <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">
                {cron.job}
              </pre>
            </div>
          )}
          {type === 'command' && cron.command && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Command</p>
              <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">
                {cron.command}
              </pre>
            </div>
          )}
          {type === 'webhook' && (
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">URL</p>
                <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto">
                  {cron.method && cron.method !== 'POST' ? `${cron.method} ` : ''}{cron.url}
                </pre>
              </div>
              {cron.vars && Object.keys(cron.vars).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Variables</p>
                  <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">
                    {JSON.stringify(cron.vars, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
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

  const reload = () => {
    getSwarmConfig()
      .then((data) => {
        if (data?.crons) setCrons(data.crons);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

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

  // Map sorted items back to their original index
  const getOriginalIndex = (cron) => crons.indexOf(cron);

  return (
    <>
      {/* Header with Add button */}
      <div className="flex items-center justify-between mb-4">
        {!loading && (
          <p className="text-sm text-muted-foreground">
            {crons.length} job{crons.length !== 1 ? 's' : ''} configured, {enabled.length} enabled
          </p>
        )}
        <button
          onClick={() => { setEditIndex(null); setFormOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-foreground text-background hover:bg-foreground/90"
        >
          <PlusIcon size={14} />
          Add Cron
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-border/50" />
          ))}
        </div>
      ) : crons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ClockIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No cron jobs configured</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Click "Add Cron" to create your first scheduled job.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {enabled.length > 0 && (
            <>
              <GroupHeader label="Enabled" count={enabled.length} />
              {enabled.map((cron, i) => (
                <CronCard
                  key={`enabled-${i}`}
                  cron={cron}
                  index={getOriginalIndex(cron)}
                  onEdit={(idx) => { setEditIndex(idx); setFormOpen(true); }}
                  onDelete={(idx) => setDeleteIndex(idx)}
                  onToggle={handleToggle}
                />
              ))}
            </>
          )}
          {disabled.length > 0 && (
            <>
              <GroupHeader label="Disabled" count={disabled.length} />
              {disabled.map((cron, i) => (
                <CronCard
                  key={`disabled-${i}`}
                  cron={cron}
                  index={getOriginalIndex(cron)}
                  onEdit={(idx) => { setEditIndex(idx); setFormOpen(true); }}
                  onDelete={(idx) => setDeleteIndex(idx)}
                  onToggle={handleToggle}
                />
              ))}
            </>
          )}
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
