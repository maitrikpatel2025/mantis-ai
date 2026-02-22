import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

/**
 * Fetch the remote registry index from a URL.
 * @param {string} registryUrl - URL to the registry JSON
 * @returns {Promise<object>} Registry data
 */
export async function fetchRegistry(registryUrl) {
  const res = await fetch(registryUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch registry: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Search skills in the remote registry.
 * @param {string} registryUrl - URL to the registry JSON
 * @param {string} query - Search query
 * @returns {Promise<object[]>} Matching skills
 */
export async function searchSkills(registryUrl, query) {
  const registry = await fetchRegistry(registryUrl);
  if (!registry.skills || !Array.isArray(registry.skills)) return [];

  const q = query.toLowerCase();
  return registry.skills.filter((skill) => {
    const haystack = [
      skill.name,
      skill.description,
      ...(skill.tags || []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Download and extract a skill tarball to a target directory.
 * @param {string} tarballUrl - URL to the tarball
 * @param {string} destDir - Directory to extract to (e.g., pi-skills/skill-name)
 */
export async function downloadSkill(tarballUrl, destDir) {
  const tmpFile = path.join(tmpdir(), `mantis-skill-${Date.now()}.tar.gz`);

  try {
    // Download tarball
    const res = await fetch(tarballUrl);
    if (!res.ok) {
      throw new Error(`Failed to download skill: ${res.status} ${res.statusText}`);
    }

    await pipeline(res.body, createWriteStream(tmpFile));

    // Create destination directory
    fs.mkdirSync(destDir, { recursive: true });

    // Extract tarball (strip top-level directory from GitHub archives)
    execSync(`tar xzf "${tmpFile}" --strip-components=1 -C "${destDir}"`, {
      stdio: 'pipe',
    });
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
}
