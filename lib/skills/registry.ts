import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrySkill {
  name: string;
  description?: string;
  version?: string;
  tarball?: string;
  tags?: string[];
}

export interface RegistryData {
  skills?: RegistrySkill[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Fetch the remote registry index from a URL.
 */
export async function fetchRegistry(registryUrl: string): Promise<RegistryData> {
  const res = await fetch(registryUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch registry: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<RegistryData>;
}

/**
 * Search skills in the remote registry.
 */
export async function searchSkills(registryUrl: string, query: string): Promise<RegistrySkill[]> {
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
 */
export async function downloadSkill(tarballUrl: string, destDir: string): Promise<void> {
  const tmpFile = path.join(tmpdir(), `mantis-skill-${Date.now()}.tar.gz`);

  try {
    // Download tarball
    const res = await fetch(tarballUrl);
    if (!res.ok) {
      throw new Error(`Failed to download skill: ${res.status} ${res.statusText}`);
    }

    await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(tmpFile));

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
