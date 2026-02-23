'use client';

import { useState, useEffect } from 'react';
import { SpinnerIcon, ShieldIcon, CheckIcon, XIcon } from './icons.js';

const POLICY_COLORS = {
  allow: 'bg-green-500/10 text-green-600 border-green-500/20',
  deny: 'bg-red-500/10 text-red-600 border-red-500/20',
  ask: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
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

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <>
      {/* Pending Approvals */}
      <div className="mb-6">
        <h2 className="text-sm font-medium mb-3">Pending Approvals</h2>
        {approvals.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pending approval requests.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {approvals.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs">{a.tool}</span>
                    <span className="text-muted-foreground mx-1.5">from</span>
                    <span className="text-xs">{a.agent}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(a.createdAt)}</p>
                  {a.args && Object.keys(a.args).length > 0 && (
                    <pre className="text-[10px] bg-muted rounded p-1.5 mt-1 max-h-20 overflow-auto font-mono">
                      {JSON.stringify(a.args, null, 2)}
                    </pre>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0 ml-3">
                  <button
                    onClick={() => handleApproval(a.id, true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-green-500/10 text-green-600 hover:bg-green-500/20"
                  >
                    <CheckIcon size={12} /> Approve
                  </button>
                  <button
                    onClick={() => handleApproval(a.id, false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-red-500/10 text-red-600 hover:bg-red-500/20"
                  >
                    <XIcon size={12} /> Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Policy Matrix */}
      <div className="mb-6">
        <h2 className="text-sm font-medium mb-3">Tool Policies</h2>

        {/* Add new policy */}
        <div className="flex items-end gap-2 mb-4">
          <div>
            <label className="text-[10px] text-muted-foreground">Agent</label>
            <input
              type="text"
              value={newAgent}
              onChange={(e) => setNewAgent(e.target.value)}
              placeholder="* (all)"
              className="mt-0.5 w-24 rounded-md border bg-background px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Tool</label>
            <select
              value={newTool}
              onChange={(e) => setNewTool(e.target.value)}
              className="mt-0.5 rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">Select tool...</option>
              {toolNames.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Policy</label>
            <select
              value={newPolicy}
              onChange={(e) => setNewPolicy(e.target.value)}
              className="mt-0.5 rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="ask">Ask</option>
            </select>
          </div>
          <button
            onClick={handleAddPolicy}
            disabled={!newTool}
            className="px-2.5 py-1 text-xs font-medium rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {/* Existing policies */}
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
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2 font-medium">Agent</th>
                  <th className="text-left px-4 py-2 font-medium">Tool</th>
                  <th className="text-left px-4 py-2 font-medium">Policy</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{p.agent}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.tool}</td>
                    <td className="px-4 py-2">
                      <select
                        value={p.policy}
                        onChange={(e) => handlePolicyChange(p.agent, p.tool, e.target.value)}
                        className={`rounded px-2 py-0.5 text-xs font-medium border ${POLICY_COLORS[p.policy] || ''}`}
                      >
                        <option value="allow">allow</option>
                        <option value="deny">deny</option>
                        <option value="ask">ask</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
