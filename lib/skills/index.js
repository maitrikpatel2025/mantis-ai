import fs from 'fs';
import path from 'path';
import { skillsFile, piSkillsDir, piSkillsSourceDir } from '../paths.js';
import { fetchRegistry, searchSkills as registrySearch, downloadSkill } from './registry.js';

const DEFAULT_REGISTRY = 'https://raw.githubusercontent.com/maitrikpatel2025/mantis-ai-skills/main/registry.json';

/**
 * Load the SKILLS.json manifest. Returns default if missing.
 * @returns {object}
 */
export function loadManifest() {
  try {
    if (fs.existsSync(skillsFile)) {
      return JSON.parse(fs.readFileSync(skillsFile, 'utf8'));
    }
  } catch {}
  return { registry: DEFAULT_REGISTRY, installed: {} };
}

/**
 * Save the SKILLS.json manifest.
 * @param {object} manifest
 */
function saveManifest(manifest) {
  fs.mkdirSync(path.dirname(skillsFile), { recursive: true });
  fs.writeFileSync(skillsFile, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Read the description from a skill's SKILL.md YAML frontmatter.
 * @param {string} skillDir - Path to the skill directory
 * @returns {string} Description or empty string
 */
function readSkillDescription(skillDir) {
  try {
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) return '';
    const content = fs.readFileSync(skillMdPath, 'utf8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return '';
    const descMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
    return descMatch ? descMatch[1].trim() : '';
  } catch {
    return '';
  }
}

/**
 * List all installed skills with their status.
 * Merges manifest data with actual filesystem state.
 * @returns {object[]} Array of { name, version, source, enabled, description, hasSymlink, hasFiles }
 */
export function listSkills() {
  const manifest = loadManifest();
  const skills = [];

  // Start with manifest entries
  for (const [name, info] of Object.entries(manifest.installed || {})) {
    const symlinkPath = path.join(piSkillsDir, name);
    const sourcePath = path.join(piSkillsSourceDir, name);
    // Try enabled path first (.pi/skills/), fall back to source (pi-skills/)
    const description = readSkillDescription(symlinkPath) || readSkillDescription(sourcePath);
    skills.push({
      name,
      version: info.version || 'unknown',
      source: info.source || 'unknown',
      enabled: info.enabled !== false,
      description,
      hasSymlink: fs.existsSync(symlinkPath),
      hasFiles: fs.existsSync(sourcePath),
    });
  }

  // Check for skills on disk not in manifest (e.g., bundled defaults)
  try {
    if (fs.existsSync(piSkillsSourceDir)) {
      const entries = fs.readdirSync(piSkillsSourceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (manifest.installed?.[entry.name]) continue;

        const symlinkPath = path.join(piSkillsDir, entry.name);
        const sourcePath = path.join(piSkillsSourceDir, entry.name);
        const description = readSkillDescription(symlinkPath) || readSkillDescription(sourcePath);
        skills.push({
          name: entry.name,
          version: 'unknown',
          source: 'bundled',
          enabled: fs.existsSync(symlinkPath),
          description,
          hasSymlink: fs.existsSync(symlinkPath),
          hasFiles: true,
        });
      }
    }
  } catch {}

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Install a skill from the remote registry.
 * @param {string} name - Skill name
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function installSkill(name) {
  const manifest = loadManifest();
  const registryUrl = manifest.registry || DEFAULT_REGISTRY;

  // Fetch registry and find skill
  const registry = await fetchRegistry(registryUrl);
  const skill = registry.skills?.find((s) => s.name === name);
  if (!skill) {
    return { success: false, message: `Skill "${name}" not found in registry` };
  }

  if (!skill.tarball) {
    return { success: false, message: `Skill "${name}" has no download URL` };
  }

  const destDir = path.join(piSkillsSourceDir, name);

  // Download and extract
  await downloadSkill(skill.tarball, destDir);

  // Create symlink
  const symlinkPath = path.join(piSkillsDir, name);
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
  if (fs.existsSync(symlinkPath)) {
    fs.unlinkSync(symlinkPath);
  }
  fs.symlinkSync(`../../pi-skills/${name}`, symlinkPath);

  // Update manifest
  manifest.installed = manifest.installed || {};
  manifest.installed[name] = {
    version: skill.version || '1.0.0',
    source: 'registry',
    enabled: true,
  };
  saveManifest(manifest);

  return { success: true, message: `Installed ${name}@${skill.version || '1.0.0'}` };
}

/**
 * Remove a skill entirely (files + symlink + manifest).
 * @param {string} name - Skill name
 * @returns {{ success: boolean, message: string }}
 */
export function removeSkill(name) {
  const manifest = loadManifest();

  // Remove symlink
  const symlinkPath = path.join(piSkillsDir, name);
  if (fs.existsSync(symlinkPath)) {
    fs.unlinkSync(symlinkPath);
  }

  // Remove source files
  const sourcePath = path.join(piSkillsSourceDir, name);
  if (fs.existsSync(sourcePath)) {
    fs.rmSync(sourcePath, { recursive: true, force: true });
  }

  // Remove from manifest
  if (manifest.installed?.[name]) {
    delete manifest.installed[name];
    saveManifest(manifest);
  }

  return { success: true, message: `Removed ${name}` };
}

/**
 * Enable or disable a skill (toggle symlink).
 * @param {string} name - Skill name
 * @param {boolean} enabled - Whether to enable
 * @returns {{ success: boolean, message: string }}
 */
export function toggleSkill(name, enabled) {
  const manifest = loadManifest();
  const symlinkPath = path.join(piSkillsDir, name);
  const sourcePath = path.join(piSkillsSourceDir, name);

  if (!fs.existsSync(sourcePath)) {
    return { success: false, message: `Skill "${name}" not found in pi-skills/` };
  }

  if (enabled) {
    // Create symlink if it doesn't exist
    if (!fs.existsSync(symlinkPath)) {
      fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
      fs.symlinkSync(`../../pi-skills/${name}`, symlinkPath);
    }
  } else {
    // Remove symlink
    if (fs.existsSync(symlinkPath)) {
      fs.unlinkSync(symlinkPath);
    }
  }

  // Update manifest
  manifest.installed = manifest.installed || {};
  if (!manifest.installed[name]) {
    manifest.installed[name] = { version: 'unknown', source: 'bundled' };
  }
  manifest.installed[name].enabled = enabled;
  saveManifest(manifest);

  return { success: true, message: `${enabled ? 'Enabled' : 'Disabled'} ${name}` };
}

/**
 * Search the remote registry for skills.
 * @param {string} query - Search term
 * @returns {Promise<object[]>}
 */
export async function searchRegistry(query) {
  const manifest = loadManifest();
  const registryUrl = manifest.registry || DEFAULT_REGISTRY;
  return registrySearch(registryUrl, query);
}

/**
 * Check for updates to installed skills.
 * @returns {Promise<object[]>} Array of { name, currentVersion, latestVersion }
 */
export async function checkUpdates() {
  const manifest = loadManifest();
  const registryUrl = manifest.registry || DEFAULT_REGISTRY;

  let registry;
  try {
    registry = await fetchRegistry(registryUrl);
  } catch {
    return [];
  }

  const updates = [];
  for (const [name, info] of Object.entries(manifest.installed || {})) {
    if (info.source === 'bundled') continue;
    const remote = registry.skills?.find((s) => s.name === name);
    if (remote && remote.version && remote.version !== info.version) {
      updates.push({
        name,
        currentVersion: info.version,
        latestVersion: remote.version,
      });
    }
  }

  return updates;
}
