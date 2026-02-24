'use client';

import { useState, useEffect } from 'react';
import { SpinnerIcon, BugIcon, CheckIcon, XIcon, ChevronDownIcon } from './icons.js';
import { ConfirmDialog } from './ui/confirm-dialog.js';

function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
        active
          ? 'border-emerald-500 text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      {label}
    </button>
  );
}

function Accordion({ title, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border bg-card shadow-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium hover:bg-accent/30 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {badge !== undefined && (
            <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon size={14} />
        </span>
      </button>
      {open && <div className="border-t px-4 py-3">{children}</div>}
    </div>
  );
}

function EnvTable({ env }) {
  if (!env) return null;
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
      {Object.entries(env).map(([key, val]) => (
        <div key={key} className="contents">
          <span className="font-mono text-muted-foreground">{key}</span>
          <span className={val ? 'text-foreground font-mono' : 'text-muted-foreground italic'}>
            {val || 'not set'}
          </span>
        </div>
      ))}
    </div>
  );
}

function ConfigFiles({ files }) {
  if (!files) return null;
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs">
      {Object.entries(files).map(([name, exists]) => (
        <div key={name} className="contents">
          <span className="font-mono">{name}</span>
          <span className={`inline-flex items-center gap-1 ${exists ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${exists ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {exists ? 'found' : 'missing'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DebugPage({
  getDebugInfoAction,
  testLlmConnectionAction,
  resetAgentCacheAction,
  clearCheckpointsAction,
}) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState('system');

  useEffect(() => {
    getDebugInfoAction()
      .then((data) => setInfo(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleTestLlm = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testLlmConnectionAction();
    setTestResult(result);
    setTesting(false);
  };

  const handleResetCache = async () => {
    await resetAgentCacheAction();
    const data = await getDebugInfoAction();
    setInfo(data);
  };

  const handleClearCheckpoints = async () => {
    setClearConfirm(false);
    await clearCheckpointsAction();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <SpinnerIcon size={20} />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <BugIcon size={24} />
        </div>
        <p className="text-sm font-medium">Could not load debug info</p>
      </div>
    );
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-0 border-b mb-6">
        <Tab label="System" active={activeTab === 'system'} onClick={() => setActiveTab('system')} />
        <Tab label="Actions" active={activeTab === 'actions'} onClick={() => setActiveTab('actions')} />
      </div>

      {activeTab === 'actions' && (
        <>
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={handleTestLlm}
              disabled={testing}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border hover:bg-accent/50 disabled:opacity-50 transition-colors"
            >
              {testing ? 'Testing...' : 'Test LLM Connection'}
            </button>
            <button
              onClick={handleResetCache}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border hover:bg-accent/50 transition-colors"
            >
              Reset Agent Cache
            </button>
            <button
              onClick={() => setClearConfirm(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 transition-colors"
            >
              Clear Checkpoints
            </button>
          </div>

          {/* LLM test result */}
          {testResult && (
            <div className={`rounded-xl border p-3 mb-4 text-xs animate-fade-in ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <div className="flex items-center gap-2">
                {testResult.success ? <CheckIcon size={14} className="text-emerald-500" /> : <XIcon size={14} className="text-red-500" />}
                <span className="font-medium">{testResult.success ? 'Connection successful' : 'Connection failed'}</span>
              </div>
              {testResult.success && (
                <p className="mt-1 text-muted-foreground">
                  Latency: {testResult.latencyMs}ms | Response: "{testResult.response}"
                </p>
              )}
              {testResult.error && (
                <p className="mt-1 text-red-500">{testResult.error}</p>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'system' && (
        <div className="flex flex-col gap-3">
          <Accordion title="Environment Variables" defaultOpen>
            <EnvTable env={info.env} />
          </Accordion>

          <Accordion title="Config Files">
            <ConfigFiles files={info.configFiles} />
          </Accordion>

          <Accordion title="Channels" badge={info.channels?.length || 0}>
            {info.channels?.length > 0 ? (
              <div className="text-xs space-y-1.5">
                {info.channels.map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="font-mono">{c.id}</span>
                    <span className="text-muted-foreground">{c.type}</span>
                    <span className={`inline-flex items-center gap-1 ${c.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.enabled ? 'bg-emerald-500' : 'bg-stone-400'}`} />
                      {c.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No channels registered</p>}
          </Accordion>

          <Accordion title="Tools" badge={info.tools?.length || 0}>
            {info.tools?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {info.tools.map((t) => (
                  <span key={t} className="inline-flex px-2 py-0.5 rounded-md bg-muted text-xs font-mono">{t}</span>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No tools loaded</p>}
          </Accordion>

          <Accordion title="Agents" badge={info.agents?.length || 0}>
            {info.agents?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {info.agents.map((a) => (
                  <span key={a} className="inline-flex px-2 py-0.5 rounded-md bg-muted text-xs font-mono">{a}</span>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No sub-agents configured</p>}
          </Accordion>

          <Accordion title="Database">
            <div className="text-xs space-y-2">
              <p>Size: <span className="font-mono">{info.db?.sizeBytes ? `${(info.db.sizeBytes / 1024).toFixed(1)} KB` : '—'}</span></p>
              {info.db?.rowCounts && (
                <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                  {Object.entries(info.db.rowCounts).map(([table, count]) => (
                    <div key={table} className="contents">
                      <span className="font-mono text-muted-foreground">{table}</span>
                      <span>{count !== null ? `${count} rows` : 'N/A'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Accordion>

          <Accordion title="Recent Errors" badge={info.recentErrors?.length || 0}>
            {info.recentErrors?.length > 0 ? (
              <div className="space-y-1 text-xs font-mono max-h-48 overflow-auto">
                {info.recentErrors.map((e, i) => (
                  <div key={i} className="text-red-500 break-all whitespace-pre-wrap">{e.message}</div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No recent errors</p>}
          </Accordion>
        </div>
      )}

      <ConfirmDialog
        open={clearConfirm}
        onConfirm={handleClearCheckpoints}
        onCancel={() => setClearConfirm(false)}
        title="Clear all checkpoints?"
        description="This will delete all LangGraph conversation checkpoints. Agent memory will be lost. This cannot be undone."
        confirmLabel="Clear"
      />
    </>
  );
}
