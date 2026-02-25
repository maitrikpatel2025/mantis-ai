import fs from 'fs';
import path from 'path';
import { PROJECT_ROOT, piSkillsDir } from '../paths.js';

const INCLUDE_PATTERN = /\{\{([^}]+\.md)\}\}/g;
const VARIABLE_PATTERN = /\{\{(datetime|skills)\}\}/gi;

// Scan skill directories under .pi/skills/ for SKILL.md files and extract
// description from YAML frontmatter. Returns a bullet list of descriptions.
function loadSkillDescriptions(): string {
  try {
    if (!fs.existsSync(piSkillsDir)) {
      return 'No additional abilities configured.';
    }

    const entries = fs.readdirSync(piSkillsDir, { withFileTypes: true });
    const descriptions: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const skillMdPath = path.join(piSkillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      const content = fs.readFileSync(skillMdPath, 'utf8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) continue;

      const frontmatter = frontmatterMatch[1];
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        descriptions.push(`- ${descMatch[1].trim()}`);
      }
    }

    if (descriptions.length === 0) {
      return 'No additional abilities configured.';
    }

    return descriptions.join('\n');
  } catch {
    return 'No additional abilities configured.';
  }
}

/**
 * Resolve built-in variables like {{datetime}} and {{skills}}.
 */
function resolveVariables(content: string): string {
  return content.replace(VARIABLE_PATTERN, (match: string, variable: string) => {
    switch (variable.toLowerCase()) {
      case 'datetime':
        return new Date().toISOString();
      case 'skills':
        return loadSkillDescriptions();
      default:
        return match;
    }
  });
}

/**
 * Render a markdown file, resolving {{filepath}} includes recursively
 * and {{datetime}}, {{skills}} built-in variables.
 * Referenced file paths resolve relative to the project root.
 */
function render_md(filePath: string, chain: string[] = []): string {
  const resolved = path.resolve(filePath);

  if (chain.includes(resolved)) {
    const cycle = [...chain, resolved].map((p) => path.relative(PROJECT_ROOT, p)).join(' -> ');
    console.log(`[render_md] Circular include detected: ${cycle}`);
    return '';
  }

  if (!fs.existsSync(resolved)) {
    return '';
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const currentChain = [...chain, resolved];

  const withIncludes = content.replace(INCLUDE_PATTERN, (match: string, includePath: string) => {
    const includeResolved = path.resolve(PROJECT_ROOT, includePath.trim());
    if (!fs.existsSync(includeResolved)) {
      return match;
    }
    return render_md(includeResolved, currentChain);
  });

  return resolveVariables(withIncludes);
}

export { render_md };
