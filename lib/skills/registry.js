import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { tmpdir } from "os";
import { execSync } from "child_process";
async function fetchRegistry(registryUrl) {
  const res = await fetch(registryUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch registry: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
async function searchSkills(registryUrl, query) {
  const registry = await fetchRegistry(registryUrl);
  if (!registry.skills || !Array.isArray(registry.skills)) return [];
  const q = query.toLowerCase();
  return registry.skills.filter((skill) => {
    const haystack = [
      skill.name,
      skill.description,
      ...skill.tags || []
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}
async function downloadSkill(tarballUrl, destDir) {
  const tmpFile = path.join(tmpdir(), `mantis-skill-${Date.now()}.tar.gz`);
  try {
    const res = await fetch(tarballUrl);
    if (!res.ok) {
      throw new Error(`Failed to download skill: ${res.status} ${res.statusText}`);
    }
    await pipeline(res.body, createWriteStream(tmpFile));
    fs.mkdirSync(destDir, { recursive: true });
    execSync(`tar xzf "${tmpFile}" --strip-components=1 -C "${destDir}"`, {
      stdio: "pipe"
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
    }
  }
}
export {
  downloadSkill,
  fetchRegistry,
  searchSkills
};
