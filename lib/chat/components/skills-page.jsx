'use client';

import { useState, useEffect, useCallback } from 'react';
import { SettingsLayout } from './settings-layout.js';
import { SearchIcon, RefreshIcon, SpinnerIcon } from './icons.js';

function SkillCard({ skill, onToggle }) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(skill.name, !skill.enabled);
    } finally {
      setToggling(false);
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
          <span className="text-xs text-muted-foreground">{skill.source}</span>
        </div>
      </div>
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

export function SkillsPage({ session, getSkillsList, searchSkillsAction, installSkillAction, toggleSkillAction }) {
  const [skills, setSkills] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

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
      await loadSkills();
      // Refresh search results to show installed state
      if (searchResults) {
        setSearchResults((prev) =>
          prev.map((s) => (s.name === name ? { ...s, _installed: true } : s))
        );
      }
    }
  }

  async function handleToggle(name, enabled) {
    await toggleSkillAction(name, enabled);
    setSkills((prev) =>
      prev.map((s) => (s.name === name ? { ...s, enabled } : s))
    );
  }

  const installedNames = new Set(skills.map((s) => s.name));

  return (
    <SettingsLayout session={session}>
      <div className="space-y-6">
        {/* Installed skills */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Installed Skills</h2>
            <button
              onClick={loadSkills}
              disabled={loading}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {loading ? <SpinnerIcon size={14} /> : <RefreshIcon size={14} />}
            </button>
          </div>
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
                <SkillCard key={skill.name} skill={skill} onToggle={handleToggle} />
              ))}
            </div>
          )}
        </div>

        {/* Search registry */}
        <div>
          <h2 className="text-lg font-medium mb-3">Skill Registry</h2>
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <SearchIcon size={14} />
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
