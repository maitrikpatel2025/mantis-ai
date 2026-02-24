'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshIcon, SpinnerIcon, CubeIcon } from './icons.js';

const MODEL_COLORS = {
  'sonnet': 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  'haiku': 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  'opus': 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  'gpt': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'gemini': 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
};

function getModelColor(model) {
  if (!model) return 'bg-muted text-muted-foreground';
  const lower = model.toLowerCase();
  for (const [key, cls] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return cls;
  }
  return 'bg-muted text-muted-foreground';
}

function AgentAvatar({ agent }) {
  if (agent.avatar) {
    return (
      <img
        src={agent.avatar}
        alt={agent.displayName || agent.name}
        className="w-10 h-10 rounded-full object-cover"
      />
    );
  }

  const letter = (agent.displayName || agent.name || '?')[0].toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm font-semibold">
      {letter}
    </div>
  );
}

function AgentCard({ agent }) {
  const disabled = agent.enabled === false;

  return (
    <div className={`rounded-xl border bg-card shadow-xs transition-all hover:shadow-md ${disabled ? 'opacity-60' : ''}`}>
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <AgentAvatar agent={agent} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{agent.displayName || agent.name}</p>
              {agent.displayName && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{agent.name}</p>
              )}
            </div>
          </div>
          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full mt-1.5 ${disabled ? 'bg-stone-300 dark:bg-stone-600' : 'bg-emerald-500'}`} />
        </div>

        {agent.description && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{agent.description}</p>
        )}

        {/* Badges */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {agent.model && (
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getModelColor(agent.model)}`}>
              {agent.model}
            </span>
          )}
          {agent.tools?.length > 0 && (
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
              {agent.tools.length} tool{agent.tools.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2.5 flex items-center justify-between">
        <span className={`text-xs font-medium ${disabled ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {disabled ? 'Disabled' : 'Active'}
        </span>
        {agent.tools?.length > 0 && (
          <div className="flex gap-1">
            {agent.tools.slice(0, 3).map((tool) => (
              <span key={tool} className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-mono">
                {tool}
              </span>
            ))}
            {agent.tools.length > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                +{agent.tools.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentsPage({ session, getAgentsList }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAgentsList();
      setAgents(result || []);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  }, [getAgentsList]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted-foreground">
          {!loading && `${agents.length} agent${agents.length !== 1 ? 's' : ''} configured`}
        </p>
        <button
          onClick={loadAgents}
          disabled={loading}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-border/50" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <CubeIcon size={24} />
          </div>
          <p className="text-sm font-medium mb-1">No sub-agents configured</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Create a sub-agent by adding a directory under <code className="font-mono">config/agents/</code> with
            an <code className="font-mono">AGENT.md</code> system prompt and <code className="font-mono">config.json</code>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-muted/50 rounded-xl">
        <h3 className="text-sm font-medium mb-2">CLI Commands</h3>
        <div className="space-y-1 text-xs text-muted-foreground font-mono">
          <p>npx mantis-ai agents list</p>
          <p>npx mantis-ai agents create {'<name>'}</p>
        </div>
      </div>
    </div>
  );
}
