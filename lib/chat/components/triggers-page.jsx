'use client';

import { useState, useEffect } from 'react';
import { ZapIcon, ChevronDownIcon } from './icons.js';
import { getSwarmConfig } from '../actions.js';

const typeBadgeStyles = {
  agent: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  command: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  webhook: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
};

const typeOrder = { agent: 0, command: 1, webhook: 2 };

function sortByType(items) {
  return [...items].sort((a, b) => {
    const actions_a = a.actions || [];
    const actions_b = b.actions || [];
    const ta = typeOrder[(actions_a[0]?.type) || 'agent'] ?? 99;
    const tb = typeOrder[(actions_b[0]?.type) || 'agent'] ?? 99;
    return ta - tb;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Chip
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
// Action Card (nested inside trigger)
// ─────────────────────────────────────────────────────────────────────────────

function ActionCard({ action, index }) {
  const type = action.type || 'agent';

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Action {index + 1}</span>
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadgeStyles[type] || typeBadgeStyles.agent}`}>
          {type}
        </span>
      </div>
      {type === 'agent' && action.job && (
        <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">
          {action.job}
        </pre>
      )}
      {type === 'command' && action.command && (
        <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">
          {action.command}
        </pre>
      )}
      {type === 'webhook' && (
        <div className="flex flex-col gap-2">
          <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto">
            {action.method && action.method !== 'POST' ? `${action.method} ` : ''}{action.url}
          </pre>
          {action.vars && Object.keys(action.vars).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Variables</p>
              <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words font-mono overflow-auto max-h-48">
                {JSON.stringify(action.vars, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger Card
// ─────────────────────────────────────────────────────────────────────────────

function TriggerCard({ trigger }) {
  const [expanded, setExpanded] = useState(false);
  const disabled = trigger.enabled === false;
  const actions = trigger.actions || [];
  const actionTypes = actions
    .map((a) => a.type || 'agent')
    .filter((v, i, arr) => arr.indexOf(v) === i);

  return (
    <div className={`rounded-xl border bg-card shadow-xs transition-all hover:shadow-md ${disabled ? 'opacity-60' : ''}`}>
      {/* Card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 rounded-lg bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400">
              <ZapIcon size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{trigger.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{trigger.watch_path}</p>
            </div>
          </div>
          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full mt-1.5 ${disabled ? 'bg-stone-300 dark:bg-stone-600' : 'bg-emerald-500'}`} />
        </div>

        {/* Badges */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {actionTypes.map((t) => (
            <span key={t} className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadgeStyles[t] || typeBadgeStyles.agent}`}>
              {t}
            </span>
          ))}
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
            {actions.length} action{actions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Divider + expand */}
      <div className="border-t px-4 py-2.5 flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ChevronDownIcon size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <span>Details</span>
        </button>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t px-4 py-3 flex flex-col gap-2">
          {actions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No actions defined.</p>
          ) : (
            actions.map((action, i) => (
              <ActionCard key={i} action={action} index={i} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function TriggersPage() {
  const [triggers, setTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    getSwarmConfig()
      .then((data) => {
        if (data?.triggers) setTriggers(data.triggers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const enabled = sortByType(triggers.filter((t) => t.enabled !== false));
  const disabled = sortByType(triggers.filter((t) => t.enabled === false));
  const filtered = filter === 'enabled' ? enabled : filter === 'disabled' ? disabled : sortByType(triggers);

  return (
    <>
      {/* Filter chips */}
      <div className="flex items-center gap-2 mb-5">
        <FilterChip label="All" count={triggers.length} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label="Enabled" count={enabled.length} active={filter === 'enabled'} onClick={() => setFilter('enabled')} />
        <FilterChip label="Disabled" count={disabled.length} active={filter === 'disabled'} onClick={() => setFilter('disabled')} />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-border/50" />
          ))}
        </div>
      ) : triggers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ZapIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No triggers configured</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Add webhook triggers by editing <span className="font-mono">config/TRIGGERS.json</span> in your project.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((trigger, i) => (
            <TriggerCard key={`trigger-${i}`} trigger={trigger} />
          ))}
        </div>
      )}
    </>
  );
}
