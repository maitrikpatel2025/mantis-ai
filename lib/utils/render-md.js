import fs from "fs";
import path from "path";
import { PROJECT_ROOT, piSkillsDir } from "../paths.js";
const INCLUDE_PATTERN = /\{\{([^}]+\.md)\}\}/g;
const VARIABLE_PATTERN = /\{\{(datetime|skills)\}\}/gi;
function loadSkillDescriptions() {
  try {
    if (!fs.existsSync(piSkillsDir)) {
      return "No additional abilities configured.";
    }
    const entries = fs.readdirSync(piSkillsDir, { withFileTypes: true });
    const descriptions = [];
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const skillMdPath = path.join(piSkillsDir, entry.name, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) continue;
      const content = fs.readFileSync(skillMdPath, "utf8");
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) continue;
      const frontmatter = frontmatterMatch[1];
      const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
      if (descMatch) {
        descriptions.push(`- ${descMatch[1].trim()}`);
      }
    }
    if (descriptions.length === 0) {
      return "No additional abilities configured.";
    }
    return descriptions.join("\n");
  } catch {
    return "No additional abilities configured.";
  }
}
function resolveVariables(content) {
  return content.replace(VARIABLE_PATTERN, (match, variable) => {
    switch (variable.toLowerCase()) {
      case "datetime":
        return (/* @__PURE__ */ new Date()).toISOString();
      case "skills":
        return loadSkillDescriptions();
      default:
        return match;
    }
  });
}
function render_md(filePath, chain = []) {
  const resolved = path.resolve(filePath);
  if (chain.includes(resolved)) {
    const cycle = [...chain, resolved].map((p) => path.relative(PROJECT_ROOT, p)).join(" -> ");
    console.log(`[render_md] Circular include detected: ${cycle}`);
    return "";
  }
  if (!fs.existsSync(resolved)) {
    return "";
  }
  const content = fs.readFileSync(resolved, "utf8");
  const currentChain = [...chain, resolved];
  const withIncludes = content.replace(INCLUDE_PATTERN, (match, includePath) => {
    const includeResolved = path.resolve(PROJECT_ROOT, includePath.trim());
    if (!fs.existsSync(includeResolved)) {
      return match;
    }
    return render_md(includeResolved, currentChain);
  });
  return resolveVariables(withIncludes);
}
export {
  render_md
};
