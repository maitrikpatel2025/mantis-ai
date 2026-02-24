'use client';

import { useState, useEffect, useCallback } from 'react';
import { SearchIcon, RefreshIcon, SpinnerIcon, TrashIcon, ArrowUpCircleIcon, WrenchIcon } from './icons.js';

function SkillCard({ skill, onToggle, onRemove }) {
  const [toggling, setToggling] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(skill.name, !skill.enabled);
    } finally {
      setToggling(false);
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove "${skill.name}"? This will delete the skill files.`)) return;
    setRemoving(true);
    try {
      await onRemove(skill.name);
    } finally {
      setRemoving(false);
    }
  }

  const canRemove = onRemove && skill.source === 'registry';
  const disabled = !skill.enabled;

  return (
    <div className={`rounded-xl border bg-card shadow-xs transition-all hover:shadow-md ${disabled ? 'opacity-60' : ''}`}>
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 rounded-lg bg-violet-500/10 p-2.5 text-violet-600 dark:text-violet-400">
              <WrenchIcon size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{skill.name}</p>
              {skill.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              disabled ? 'bg-stone-300 dark:bg-stone-600' : 'bg-emerald-500'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${disabled ? 'translate-x-0.5' : 'translate-x-[18px]'}`} />
          </button>
        </div>

        {/* Badges */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
            v{skill.version}
          </span>
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${
            skill.source === 'registry'
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
              : 'bg-muted text-muted-foreground'
          }`}>
            {skill.source}
          </span>
        </div>
      </div>

      {/* Footer */}
      {canRemove && (
        <div className="border-t px-4 py-2.5 flex items-center justify-end">
          <button
            onClick={handleRemove}
            disabled={removing}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-destructive transition-colors disabled:opacity-50"
            title="Remove skill"
          >
            {removing ? <SpinnerIcon size={12} /> : <TrashIcon size={12} />}
            <span>Remove</span>
          </button>
        </div>
      )}
    </div>
  );
}

function RegistrySkillCard({ skill, installed, onInstall }) {
  const [installing, setInstalling] = useState(false);

  async function handleInstall() {
    setInstalling(true);
    try {
      await onInstall(skill.name);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-xs transition-all hover:shadow-md">
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{skill.name}</p>
            {skill.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{skill.description}</p>
            )}
          </div>
          <button
            onClick={handleInstall}
            disabled={installing || installed}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
              installed
                ? 'bg-muted text-muted-foreground'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {installing ? <SpinnerIcon size={12} /> : installed ? 'Installed' : 'Install'}
          </button>
        </div>

        {/* Badges */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
            v{skill.version}
          </span>
          {skill.author && (
            <span className="text-[10px] text-muted-foreground">by {skill.author}</span>
          )}
          {skill.tags?.map((tag) => (
            <span key={tag} className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function UpdateCard({ update, onUpdate }) {
  const [updating, setUpdating] = useState(false);

  async function handleUpdate() {
    setUpdating(true);
    try {
      await onUpdate(update.name);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{update.name}</span>
        <span className="text-xs text-muted-foreground">
          {update.currentVersion} → {update.latestVersion}
        </span>
      </div>
      <button
        onClick={handleUpdate}
        disabled={updating}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
      >
        {updating ? <SpinnerIcon size={12} /> : 'Update'}
      </button>
    </div>
  );
}

export function SkillsPage({
  session,
  getSkillsList,
  searchSkillsAction,
  installSkillAction,
  toggleSkillAction,
  removeSkillAction,
  checkSkillUpdatesAction,
}) {
  const [skills, setSkills] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [updates, setUpdates] = useState(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  function showStatus(message, isError = false) {
    setStatusMessage({ text: message, isError });
    setTimeout(() => setStatusMessage(null), 3000);
  }

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSkillsList();
      setSkills(result || []);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  }, [getSkillsList]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchSkillsAction(searchQuery);
      setSearchResults(results || []);
    } catch (err) {
      console.error('Failed to search skills:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleInstall(name) {
    const result = await installSkillAction(name);
    if (result?.success) {
      showStatus(result.message);
      await loadSkills();
      if (searchResults) {
        setSearchResults((prev) =>
          prev.map((s) => (s.name === name ? { ...s, _installed: true } : s))
        );
      }
    } else {
      showStatus(result?.message || 'Install failed', true);
    }
  }

  async function handleToggle(name, enabled) {
    const result = await toggleSkillAction(name, enabled);
    if (result?.success) {
      setSkills((prev) =>
        prev.map((s) => (s.name === name ? { ...s, enabled } : s))
      );
    } else {
      showStatus(result?.message || 'Toggle failed', true);
    }
  }

  async function handleRemove(name) {
    if (!removeSkillAction) return;
    const result = await removeSkillAction(name);
    if (result?.success) {
      showStatus(result.message);
      setSkills((prev) => prev.filter((s) => s.name !== name));
    } else {
      showStatus(result?.message || 'Remove failed', true);
    }
  }

  async function handleCheckUpdates() {
    if (!checkSkillUpdatesAction) return;
    setCheckingUpdates(true);
    try {
      const result = await checkSkillUpdatesAction();
      setUpdates(result || []);
      if (!result || result.length === 0) {
        showStatus('All skills are up to date');
      }
    } catch (err) {
      console.error('Failed to check updates:', err);
      showStatus('Failed to check for updates', true);
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function handleUpdate(name) {
    const result = await installSkillAction(name);
    if (result?.success) {
      showStatus(result.message);
      setUpdates((prev) => prev.filter((u) => u.name !== name));
      await loadSkills();
    } else {
      showStatus(result?.message || 'Update failed', true);
    }
  }

  const installedNames = new Set(skills.map((s) => s.name));

  return (
    <div className="space-y-6">
      {/* Status message */}
      {statusMessage && (
        <div
          className={`px-4 py-2 rounded-xl text-sm animate-fade-in ${
            statusMessage.isError
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Installed skills */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {!loading && `${skills.length} skill${skills.length !== 1 ? 's' : ''} installed`}
          </p>
          <div className="flex items-center gap-2">
            {checkSkillUpdatesAction && (
              <button
                onClick={handleCheckUpdates}
                disabled={checkingUpdates}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {checkingUpdates ? <SpinnerIcon size={12} /> : <ArrowUpCircleIcon size={12} />}
                Check for Updates
              </button>
            )}
            <button
              onClick={loadSkills}
              disabled={loading}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {loading ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
            </button>
          </div>
        </div>

        {/* Updates available */}
        {updates && updates.length > 0 && (
          <div className="mb-4 space-y-2">
            {updates.map((update) => (
              <UpdateCard key={update.name} update={update} onUpdate={handleUpdate} />
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-border/50" />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <WrenchIcon size={24} />
            </div>
            <p className="text-sm font-medium mb-1">No skills installed</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Search the registry below to install skills.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {skills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                onToggle={handleToggle}
                onRemove={removeSkillAction ? handleRemove : null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Search registry */}
      <div className="border-t pt-6">
        <h2 className="text-sm font-semibold mb-3">Skill Registry</h2>
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <SearchIcon size={14} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-lg bg-transparent shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-[color,box-shadow]"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent transition-colors"
          >
            {searching ? <SpinnerIcon size={14} /> : 'Search'}
          </button>
        </form>
        {searchResults !== null && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 col-span-full">No skills found.</p>
            ) : (
              searchResults.map((skill) => (
                <RegistrySkillCard
                  key={skill.name}
                  skill={skill}
                  installed={installedNames.has(skill.name) || skill._installed}
                  onInstall={handleInstall}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
