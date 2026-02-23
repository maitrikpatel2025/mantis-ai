'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshIcon, SpinnerIcon } from './icons.js';

function AgentAvatar({ agent }) {
  if (agent.avatar) {
    return (
      <img
        src={agent.avatar}
        alt={agent.displayName || agent.name}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }

  // Letter circle fallback
  const letter = (agent.displayName || agent.name || '?')[0].toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
      {letter}
    </div>
  );
}

function AgentCard({ agent }) {
  return (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
      <div className="flex items-center gap-3">
        <AgentAvatar agent={agent} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{agent.displayName || agent.name}</span>
            {agent.displayName && (
              <span className="text-xs text-muted-foreground">({agent.name})</span>
            )}
            {agent.model && (
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                {agent.model}
              </span>
            )}
          </div>
          {agent.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{agent.description}</p>
          )}
          {agent.tools?.length > 0 && (
            <div className="flex gap-1 mt-1">
              {agent.tools.map((tool) => (
                <span key={tool} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                  {tool}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <span
        className={`text-xs px-2 py-1 rounded-full ${
          agent.enabled !== false
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {agent.enabled !== false ? 'Active' : 'Disabled'}
      </span>
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
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Sub-Agents</h2>
            <button
              onClick={loadAgents}
              disabled={loading}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {loading ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <SpinnerIcon size={16} />
              <span className="ml-2 text-sm">Loading agents...</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="py-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                No sub-agents configured.
              </p>
              <p className="text-sm text-muted-foreground">
                Create a sub-agent by adding a directory under <code>config/agents/</code> with
                an <code>AGENT.md</code> system prompt and <code>config.json</code>.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <AgentCard key={agent.name} agent={agent} />
              ))}
            </div>
          )}

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h3 className="text-sm font-medium mb-2">CLI Commands</h3>
            <div className="space-y-1 text-xs text-muted-foreground font-mono">
              <p>npx mantis-ai agents list</p>
              <p>npx mantis-ai agents create {'<name>'}</p>
            </div>
          </div>
        </div>
      </div>
  );
}
