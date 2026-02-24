'use client';

import { useState, useEffect, useCallback } from 'react';
import { SpinnerIcon, ShieldIcon, CheckIcon, XIcon } from './icons.js';
import { useEventStream } from '../../events/use-event-stream.js';

const POLICY_COLORS = {
  allow: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  deny: 'bg-red-500/10 text-red-600 border-red-500/20',
  ask: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
};

const POLICY_DOT = {
  allow: 'bg-emerald-500',
  deny: 'bg-red-500',
  ask: 'bg-amber-500',
};

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return `${Math.round(diff / 3600000)}h ago`;
}

export function SecurityPage({
  getSecurityPoliciesAction,
  updateToolPolicyAction,
  getPendingApprovalsAction,
  respondToApprovalAction,
  getToolNamesAction,
}) {
  const [policies, setPolicies] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [toolNames, setToolNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newAgent, setNewAgent] = useState('*');
  const [newTool, setNewTool] = useState('');
  const [newPolicy, setNewPolicy] = useState('allow');

  const fetchAll = () => {
    Promise.all([
      getSecurityPoliciesAction(),
      getPendingApprovalsAction(),
      getToolNamesAction(),
    ])
      .then(([p, a, t]) => {
        setPolicies(p || []);
        setApprovals(a || []);
        setToolNames(t || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  // SSE: refetch on approval events
  useEventStream('approval:created', useCallback(() => fetchAll(), []));
  useEventStream('approval:resolved', useCallback(() => fetchAll(), []));

  const handleAddPolicy = async () => {
    if (!newTool) return;
    await updateToolPolicyAction(newAgent, newTool, newPolicy);
    setNewTool('');
    fetchAll();
  };

  const handleApproval = async (id, approved) => {
    await respondToApprovalAction(id, approved);
    fetchAll();
  };

  const handlePolicyChange = async (agent, tool, policy) => {
    await updateToolPolicyAction(agent, tool, policy);
    fetchAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <SpinnerIcon size={20} />
      </div>
    );
  }

  // Group policies by agent
  const policyGroups = {};
  for (const p of policies) {
    if (!policyGroups[p.agent]) policyGroups[p.agent] = [];
    policyGroups[p.agent].push(p);
  }

  return (
    <>
      {/* Pending Approvals */}
      {approvals.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-3">Pending Approvals</h2>
          <div className="flex flex-col gap-2">
            {approvals.map((a) => (
              <div key={a.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 shadow-xs p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{a.tool}</span>
                    <span className="text-muted-foreground mx-1.5">from</span>
                    <span className="text-xs font-medium">{a.agent}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(a.createdAt)}</p>
                  {a.args && Object.keys(a.args).length > 0 && (
                    <pre className="text-[10px] bg-muted rounded-lg p-1.5 mt-1.5 max-h-20 overflow-auto font-mono">
                      {JSON.stringify(a.args, null, 2)}
                    </pre>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0 ml-3">
                  <button
                    onClick={() => handleApproval(a.id, true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                  >
                    <CheckIcon size={12} /> Approve
                  </button>
                  <button
                    onClick={() => handleApproval(a.id, false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    <XIcon size={12} /> Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new policy */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3">Add Policy</h2>
        <div className="flex items-end gap-2 p-4 rounded-xl border bg-card shadow-xs">
          <div>
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Agent</label>
            <input
              type="text"
              value={newAgent}
              onChange={(e) => setNewAgent(e.target.value)}
              placeholder="* (all)"
              className="mt-1 w-28 rounded-lg border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Tool</label>
            <select
              value={newTool}
              onChange={(e) => setNewTool(e.target.value)}
              className="mt-1 rounded-lg border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
            >
              <option value="">Select tool...</option>
              {toolNames.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Policy</label>
            <select
              value={newPolicy}
              onChange={(e) => setNewPolicy(e.target.value)}
              className="mt-1 rounded-lg border border-input bg-transparent px-2 py-1.5 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="ask">Ask</option>
            </select>
          </div>
          <button
            onClick={handleAddPolicy}
            disabled={!newTool}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Policy Matrix grouped by agent */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Tool Policies</h2>

        {policies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <ShieldIcon size={24} />
            </div>
            <p className="text-sm font-medium mb-1">No policies configured</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              All tools are allowed by default. Add policies to restrict or require approval for specific tools.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {Object.entries(policyGroups).map(([agent, agentPolicies]) => (
              <div key={agent} className="rounded-xl border bg-card shadow-xs overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent: </span>
                  <span className="text-sm font-mono font-medium">{agent}</span>
                </div>
                <div className="divide-y">
                  {agentPolicies.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors">
                      <span className="font-mono text-xs">{p.tool}</span>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${POLICY_DOT[p.policy] || 'bg-muted-foreground'}`} />
                        <select
                          value={p.policy}
                          onChange={(e) => handlePolicyChange(p.agent, p.tool, e.target.value)}
                          className={`rounded-lg px-2 py-0.5 text-xs font-medium border ${POLICY_COLORS[p.policy] || ''}`}
                        >
                          <option value="allow">allow</option>
                          <option value="deny">deny</option>
                          <option value="ask">ask</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
