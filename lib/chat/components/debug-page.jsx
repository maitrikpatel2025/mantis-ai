'use client';

import { useState, useEffect } from 'react';
import { SpinnerIcon, BugIcon, CheckIcon, XIcon, ChevronDownIcon } from './icons.js';
import { ConfirmDialog } from './ui/confirm-dialog.js';

function Accordion({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium hover:bg-accent/50 rounded-lg"
      >
        {title}
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
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {Object.entries(env).map(([key, val]) => (
        <div key={key} className="contents">
          <span className="font-mono text-muted-foreground">{key}</span>
          <span className={val ? 'text-foreground' : 'text-muted-foreground italic'}>
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
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {Object.entries(files).map(([name, exists]) => (
        <div key={name} className="contents">
          <span className="font-mono">{name}</span>
          <span className={exists ? 'text-green-500' : 'text-red-500'}>
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
    // Refresh
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
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={handleTestLlm}
          disabled={testing}
          className="px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-accent/50 disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Test LLM Connection'}
        </button>
        <button
          onClick={handleResetCache}
          className="px-3 py-1.5 text-xs font-medium rounded-md border hover:bg-accent/50"
        >
          Reset Agent Cache
        </button>
        <button
          onClick={() => setClearConfirm(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-500/20 text-red-500 hover:bg-red-500/10"
        >
          Clear Checkpoints
        </button>
      </div>

      {/* LLM test result */}
      {testResult && (
        <div className={`rounded-lg border p-3 mb-4 text-xs ${testResult.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <div className="flex items-center gap-2">
            {testResult.success ? <CheckIcon size={14} className="text-green-500" /> : <XIcon size={14} className="text-red-500" />}
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

      <div className="flex flex-col gap-3">
        <Accordion title="Environment Variables" defaultOpen>
          <EnvTable env={info.env} />
        </Accordion>

        <Accordion title="Config Files">
          <ConfigFiles files={info.configFiles} />
        </Accordion>

        <Accordion title={`Channels (${info.channels?.length || 0})`}>
          {info.channels?.length > 0 ? (
            <div className="text-xs space-y-1">
              {info.channels.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="font-mono">{c.id}</span>
                  <span className="text-muted-foreground">{c.type}</span>
                  <span className={c.enabled ? 'text-green-500' : 'text-muted-foreground'}>{c.enabled ? 'enabled' : 'disabled'}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">No channels registered</p>}
        </Accordion>

        <Accordion title={`Tools (${info.tools?.length || 0})`}>
          {info.tools?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {info.tools.map((t) => (
                <span key={t} className="inline-flex px-2 py-0.5 rounded bg-muted text-xs font-mono">{t}</span>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">No tools loaded</p>}
        </Accordion>

        <Accordion title={`Agents (${info.agents?.length || 0})`}>
          {info.agents?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {info.agents.map((a) => (
                <span key={a} className="inline-flex px-2 py-0.5 rounded bg-muted text-xs font-mono">{a}</span>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">No sub-agents configured</p>}
        </Accordion>

        <Accordion title="Database">
          <div className="text-xs space-y-2">
            <p>Size: <span className="font-mono">{info.db?.sizeBytes ? `${(info.db.sizeBytes / 1024).toFixed(1)} KB` : '—'}</span></p>
            {info.db?.rowCounts && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
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

        <Accordion title={`Recent Errors (${info.recentErrors?.length || 0})`}>
          {info.recentErrors?.length > 0 ? (
            <div className="space-y-1 text-xs font-mono max-h-48 overflow-auto">
              {info.recentErrors.map((e, i) => (
                <div key={i} className="text-red-500 break-all whitespace-pre-wrap">{e.message}</div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">No recent errors</p>}
        </Accordion>
      </div>

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
