'use client';

import { useState, useEffect, useCallback } from 'react';
import { SettingsLayout } from './settings-layout.js';
import { SearchIcon, RefreshIcon, SpinnerIcon, TrashIcon, ArrowUpCircleIcon } from './icons.js';

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

  return (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{skill.name}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
            {skill.version}
          </span>
          <span className="text-xs text-muted-foreground">{skill.source}</span>
        </div>
        {skill.description && (
          <p className="text-xs text-muted-foreground mt-1">{skill.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canRemove && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
            title="Remove skill"
          >
            {removing ? <SpinnerIcon size={14} /> : <TrashIcon size={14} />}
          </button>
        )}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            skill.enabled ? 'bg-foreground' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
              skill.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
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
    <div className="flex items-center justify-between p-4 border border-border rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{skill.name}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
            {skill.version}
          </span>
          {skill.author && (
            <span className="text-xs text-muted-foreground">by {skill.author}</span>
          )}
        </div>
        {skill.description && (
          <p className="text-xs text-muted-foreground mt-1">{skill.description}</p>
        )}
        {skill.tags?.length > 0 && (
          <div className="flex gap-1 mt-1">
            {skill.tags.map((tag) => (
              <span key={tag} className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={handleInstall}
        disabled={installing || installed}
        className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
      >
        {installing ? <SpinnerIcon size={12} /> : installed ? 'Installed' : 'Install'}
      </button>
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
    <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{update.name}</span>
        <span className="text-xs text-muted-foreground">
          {update.currentVersion} → {update.latestVersion}
        </span>
      </div>
      <button
        onClick={handleUpdate}
        disabled={updating}
        className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
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
    // Re-install to get the latest version
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
    <SettingsLayout session={session}>
      <div className="space-y-6">
        {/* Status message */}
        {statusMessage && (
          <div
            className={`px-4 py-2 rounded-md text-sm ${
              statusMessage.isError
                ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                : 'bg-green-500/10 text-green-500 border border-green-500/20'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Installed skills */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Installed Skills</h2>
            <div className="flex items-center gap-2">
              {checkSkillUpdatesAction && (
                <button
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdates}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
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
              <h3 className="text-sm font-medium text-muted-foreground">Updates Available</h3>
              {updates.map((update) => (
                <UpdateCard key={update.name} update={update} onUpdate={handleUpdate} />
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <SpinnerIcon size={16} />
              <span className="ml-2 text-sm">Loading skills...</span>
            </div>
          ) : skills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No skills installed.</p>
          ) : (
            <div className="space-y-2">
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
        <div>
          <h2 className="text-lg font-medium mb-3">Skill Registry</h2>
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <SearchIcon size={14} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted transition-colors"
            >
              {searching ? <SpinnerIcon size={14} /> : 'Search'}
            </button>
          </form>
          {searchResults !== null && (
            <div className="space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No skills found.</p>
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
    </SettingsLayout>
  );
}
