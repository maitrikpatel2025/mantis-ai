#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const command = process.argv[2];
const args = process.argv.slice(3);

// Files tightly coupled to the package version that are auto-updated by init.
// These live in the user's project because GitHub/Docker require them at specific paths,
// but they shouldn't drift from the package version.
const MANAGED_PATHS = [
  '.github/workflows/',
  'docker/event-handler/',
  'docker-compose.yml',
  '.dockerignore',
];

function isManaged(relPath) {
  return MANAGED_PATHS.some(p => relPath === p || relPath.startsWith(p));
}

// Files that must never be scaffolded directly (use .template suffix instead).
const EXCLUDED_FILENAMES = ['CLAUDE.md'];

// Files ending in .template are scaffolded with the suffix stripped.
// e.g. .gitignore.template → .gitignore, CLAUDE.md.template → CLAUDE.md
function destPath(templateRelPath) {
  if (templateRelPath.endsWith('.template')) {
    return templateRelPath.slice(0, -'.template'.length);
  }
  return templateRelPath;
}

function templatePath(userPath, templatesDir) {
  const withSuffix = userPath + '.template';
  if (fs.existsSync(path.join(templatesDir, withSuffix))) {
    return withSuffix;
  }
  return userPath;
}

function printUsage() {
  console.log(`
Usage: mantis-ai <command>

Commands:
  init                              Scaffold a new Mantis AI project
  setup                             Run interactive setup wizard
  setup-telegram                    Reconfigure Telegram webhook
  setup-slack                       Configure Slack channel
  setup-discord                     Configure Discord channel
  setup-whatsapp                    Configure WhatsApp channel
  reset-auth                        Regenerate AUTH_SECRET (invalidates all sessions)
  reset [file]                      Restore a template file (or list available templates)
  diff [file]                       Show differences between project files and package templates
  set-agent-secret <KEY> [VALUE]    Set a GitHub secret with AGENT_ prefix (also updates .env)
  set-agent-llm-secret <KEY> [VALUE]  Set a GitHub secret with AGENT_LLM_ prefix
  set-var <KEY> [VALUE]             Set a GitHub repository variable
  skills <subcommand>               Manage skills
    list                            List installed skills
    search <query>                  Search the remote skill registry
    install <name>                  Install a skill from the registry
    remove <name>                   Remove an installed skill
    enable <name>                   Enable a skill
    disable <name>                  Disable a skill
    update [name]                   Check for / apply skill updates
  agents <subcommand>               Manage sub-agents
    list                            List configured sub-agents
    create <name>                   Scaffold a new sub-agent
`);
}

/**
 * Collect all template files as relative paths.
 */
function getTemplateFiles(templatesDir) {
  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (!EXCLUDED_FILENAMES.includes(entry.name)) {
        files.push(path.relative(templatesDir, fullPath));
      }
    }
  }
  walk(templatesDir);
  return files;
}

async function init() {
  let cwd = process.cwd();
  const packageDir = path.join(__dirname, '..');
  const templatesDir = path.join(packageDir, 'templates');
  const noManaged = args.includes('--no-managed');

  // Guard: warn if the directory is not empty (unless it's an existing Mantis AI project)
  const entries = fs.readdirSync(cwd);
  if (entries.length > 0) {
    const pkgPath = path.join(cwd, 'package.json');
    let isExistingProject = false;
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = pkg.dependencies || {};
        const devDeps = pkg.devDependencies || {};
        if (deps['mantis-ai'] || devDeps['mantis-ai']) {
          isExistingProject = true;
        }
      } catch {}
    }

    if (!isExistingProject) {
      console.log('\nThis directory is not empty.');
      const { text, isCancel } = await import('@clack/prompts');
      const dirName = await text({
        message: 'Project directory name:',
        defaultValue: 'my-mantis',
      });
      if (isCancel(dirName)) {
        console.log('\nCancelled.\n');
        process.exit(0);
      }
      const newDir = path.resolve(cwd, dirName);
      fs.mkdirSync(newDir, { recursive: true });
      process.chdir(newDir);
      cwd = newDir;
      console.log(`\nCreated ${dirName}/`);
    }
  }

  console.log('\nScaffolding Mantis AI project...\n');

  const templateFiles = getTemplateFiles(templatesDir);
  const created = [];
  const skipped = [];
  const changed = [];
  const updated = [];

  for (const relPath of templateFiles) {
    const src = path.join(templatesDir, relPath);
    const outPath = destPath(relPath);
    const dest = path.join(cwd, outPath);

    if (!fs.existsSync(dest)) {
      // File doesn't exist — create it
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      created.push(outPath);
      console.log(`  Created ${outPath}`);
    } else {
      // File exists — check if template has changed
      const srcContent = fs.readFileSync(src);
      const destContent = fs.readFileSync(dest);
      if (srcContent.equals(destContent)) {
        skipped.push(outPath);
      } else if (!noManaged && isManaged(outPath)) {
        // Managed file differs — auto-update to match package
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        updated.push(outPath);
        console.log(`  Updated ${outPath}`);
      } else {
        changed.push(outPath);
        console.log(`  Skipped ${outPath} (already exists)`);
      }
    }
  }

  // Create package.json if it doesn't exist
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    const dirName = path.basename(cwd);
    const { version } = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    const mantisDep = version.includes('-') ? version : '^1.0.0';
    const pkg = {
      name: dirName,
      private: true,
      scripts: {
        dev: 'next dev --turbopack',
        build: 'next build',
        start: 'next start',
        setup: 'mantis-ai setup',
        'setup-telegram': 'mantis-ai setup-telegram',
        'reset-auth': 'mantis-ai reset-auth',
      },
      dependencies: {
        'mantis-ai': mantisDep,
        next: '^15.5.12',
        'next-auth': '5.0.0-beta.30',
        'next-themes': '^0.4.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        tailwindcss: '^4.0.0',
        '@tailwindcss/postcss': '^4.0.0',
      },
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('  Created package.json');
  } else {
    console.log('  Skipped package.json (already exists)');
  }

  // Create .gitkeep files for empty dirs
  const gitkeepDirs = ['cron', 'triggers', 'logs', 'tmp', 'data'];
  for (const dir of gitkeepDirs) {
    const gitkeep = path.join(cwd, dir, '.gitkeep');
    if (!fs.existsSync(gitkeep)) {
      fs.mkdirSync(path.join(cwd, dir), { recursive: true });
      fs.writeFileSync(gitkeep, '');
    }
  }

  // Create default skill symlinks (brave-search, browser-tools)
  const defaultSkills = ['brave-search', 'browser-tools'];
  for (const skill of defaultSkills) {
    const symlink = path.join(cwd, '.pi', 'skills', skill);
    if (!fs.existsSync(symlink)) {
      fs.mkdirSync(path.dirname(symlink), { recursive: true });
      fs.symlinkSync(`../../pi-skills/${skill}`, symlink);
      console.log(`  Created .pi/skills/${skill} → ../../pi-skills/${skill}`);
    }
  }

  // Report updated managed files
  if (updated.length > 0) {
    console.log('\n  Updated managed files:');
    for (const file of updated) {
      console.log(`    ${file}`);
    }
  }

  // Report changed templates
  if (changed.length > 0) {
    console.log('\n  Updated templates available:');
    console.log('  These files differ from the current package templates.');
    console.log('  This may be from your edits, or from a mantis-ai update.\n');
    for (const file of changed) {
      console.log(`    ${file}`);
    }
    console.log('\n  To view differences:  npx mantis-ai diff <file>');
    console.log('  To reset to default:  npx mantis-ai reset <file>');
  }

  // Run npm install
  console.log('\nInstalling dependencies...\n');
  execSync('npm install', { stdio: 'inherit', cwd });

  // Create or update .env with auto-generated infrastructure values
  const envPath = path.join(cwd, '.env');
  const { randomBytes } = await import('crypto');
  const mantisPkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const version = mantisPkg.version;

  if (!fs.existsSync(envPath)) {
    // Seed .env for new projects
    const authSecret = randomBytes(32).toString('base64');
    const seedEnv = `# Mantis AI Configuration
# Run "npm run setup" to complete configuration

AUTH_SECRET=${authSecret}
AUTH_TRUST_HOST=true
MANTIS_VERSION=${version}
`;
    fs.writeFileSync(envPath, seedEnv);
    console.log(`  Created .env (AUTH_SECRET, MANTIS_VERSION=${version})`);
  } else {
    // Update MANTIS_VERSION in existing .env
    try {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.match(/^MANTIS_VERSION=.*/m)) {
        envContent = envContent.replace(/^MANTIS_VERSION=.*/m, `MANTIS_VERSION=${version}`);
      } else {
        envContent = envContent.trimEnd() + `\nMANTIS_VERSION=${version}\n`;
      }
      fs.writeFileSync(envPath, envContent);
      console.log(`  Updated MANTIS_VERSION to ${version}`);
    } catch {}
  }

  console.log('\nDone! Run: npm run setup\n');
}

/**
 * List all available template files, or restore a specific one.
 */
function reset(filePath) {
  const packageDir = path.join(__dirname, '..');
  const templatesDir = path.join(packageDir, 'templates');
  const cwd = process.cwd();

  if (!filePath) {
    console.log('\nAvailable template files:\n');
    const files = getTemplateFiles(templatesDir);
    for (const file of files) {
      console.log(`  ${destPath(file)}`);
    }
    console.log('\nUsage: mantis-ai reset <file>');
    console.log('Example: mantis-ai reset config/SOUL.md\n');
    return;
  }

  const tmplPath = templatePath(filePath, templatesDir);
  const src = path.join(templatesDir, tmplPath);
  const dest = path.join(cwd, filePath);

  if (!fs.existsSync(src)) {
    console.error(`\nTemplate not found: ${filePath}`);
    console.log('Run "mantis-ai reset" to see available templates.\n');
    process.exit(1);
  }

  if (fs.statSync(src).isDirectory()) {
    console.log(`\nRestoring ${filePath}/...\n`);
    copyDirSyncForce(src, dest, tmplPath);
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`\nRestored ${filePath}\n`);
  }
}

/**
 * Show the diff between a user's file and the package template.
 */
function diff(filePath) {
  const packageDir = path.join(__dirname, '..');
  const templatesDir = path.join(packageDir, 'templates');
  const cwd = process.cwd();

  if (!filePath) {
    // Show all files that differ
    console.log('\nFiles that differ from package templates:\n');
    const files = getTemplateFiles(templatesDir);
    let anyDiff = false;
    for (const file of files) {
      const src = path.join(templatesDir, file);
      const outPath = destPath(file);
      const dest = path.join(cwd, outPath);
      if (fs.existsSync(dest)) {
        const srcContent = fs.readFileSync(src);
        const destContent = fs.readFileSync(dest);
        if (!srcContent.equals(destContent)) {
          console.log(`  ${outPath}`);
          anyDiff = true;
        }
      } else {
        console.log(`  ${outPath} (missing)`);
        anyDiff = true;
      }
    }
    if (!anyDiff) {
      console.log('  All files match package templates.');
    }
    console.log('\nUsage: mantis-ai diff <file>');
    console.log('Example: mantis-ai diff config/SOUL.md\n');
    return;
  }

  const tmplPath = templatePath(filePath, templatesDir);
  const src = path.join(templatesDir, tmplPath);
  const dest = path.join(cwd, filePath);

  if (!fs.existsSync(src)) {
    console.error(`\nTemplate not found: ${filePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(dest)) {
    console.log(`\n${filePath} does not exist in your project.`);
    console.log(`Run "mantis-ai reset ${filePath}" to create it.\n`);
    return;
  }

  try {
    // Use git diff for nice colored output, fall back to plain diff
    execSync(`git diff --no-index -- "${dest}" "${src}"`, { stdio: 'inherit' });
    console.log('\nFiles are identical.\n');
  } catch (e) {
    // git diff exits with 1 when files differ (output already printed)
    console.log(`\n  To reset: mantis-ai reset ${filePath}\n`);
  }
}

function copyDirSyncForce(src, dest, templateRelBase = '') {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_FILENAMES.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const templateRel = templateRelBase
      ? path.join(templateRelBase, entry.name)
      : entry.name;
    const outName = path.basename(destPath(templateRel));
    const destFile = path.join(dest, outName);
    if (entry.isDirectory()) {
      copyDirSyncForce(srcPath, destFile, templateRel);
    } else {
      fs.copyFileSync(srcPath, destFile);
      console.log(`  Restored ${path.relative(process.cwd(), destFile)}`);
    }
  }
}

function setup() {
  const setupScript = path.join(__dirname, '..', 'setup', 'setup.mjs');
  try {
    execSync(`node ${setupScript}`, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    process.exit(1);
  }
}

function setupTelegram() {
  const setupScript = path.join(__dirname, '..', 'setup', 'setup-telegram.mjs');
  try {
    execSync(`node ${setupScript}`, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    process.exit(1);
  }
}

function setupSlack() {
  const setupScript = path.join(__dirname, '..', 'setup', 'setup-slack.mjs');
  try {
    execSync(`node ${setupScript}`, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    process.exit(1);
  }
}

function setupDiscord() {
  const setupScript = path.join(__dirname, '..', 'setup', 'setup-discord.mjs');
  try {
    execSync(`node ${setupScript}`, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    process.exit(1);
  }
}

function setupWhatsapp() {
  const setupScript = path.join(__dirname, '..', 'setup', 'setup-whatsapp.mjs');
  try {
    execSync(`node ${setupScript}`, { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    process.exit(1);
  }
}

async function resetAuth() {
  const { randomBytes } = await import('crypto');
  const { updateEnvVariable } = await import(path.join(__dirname, '..', 'setup', 'lib', 'auth.mjs'));

  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('\n  No .env file found. Run "npm run setup" first.\n');
    process.exit(1);
  }

  const newSecret = randomBytes(32).toString('base64');
  updateEnvVariable('AUTH_SECRET', newSecret);
  console.log('\n  AUTH_SECRET regenerated.');
  console.log('  All existing sessions have been invalidated.');
  console.log('  Restart your server for the change to take effect.\n');
}

/**
 * Load GH_OWNER and GH_REPO from .env
 */
function loadRepoInfo() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('\n  No .env file found. Run "npm run setup" first.\n');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  if (!env.GH_OWNER || !env.GH_REPO) {
    console.error('\n  GH_OWNER and GH_REPO not found in .env. Run "npm run setup" first.\n');
    process.exit(1);
  }
  return { owner: env.GH_OWNER, repo: env.GH_REPO };
}

/**
 * Prompt for a secret value interactively if not provided as an argument
 */
async function promptForValue(key) {
  const { password, isCancel } = await import('@clack/prompts');
  const value = await password({
    message: `Enter value for ${key}:`,
    validate: (input) => {
      if (!input) return 'Value is required';
    },
  });
  if (isCancel(value)) {
    console.log('\nCancelled.\n');
    process.exit(0);
  }
  return value;
}

async function setAgentSecret(key, value) {
  if (!key) {
    console.error('\n  Usage: mantis-ai set-agent-secret <KEY> [VALUE]\n');
    console.error('  Example: mantis-ai set-agent-secret ANTHROPIC_API_KEY\n');
    process.exit(1);
  }

  if (!value) value = await promptForValue(key);

  const { owner, repo } = loadRepoInfo();
  const prefixedName = `AGENT_${key}`;

  const { setSecret } = await import(path.join(__dirname, '..', 'setup', 'lib', 'github.mjs'));
  const { updateEnvVariable } = await import(path.join(__dirname, '..', 'setup', 'lib', 'auth.mjs'));

  const result = await setSecret(owner, repo, prefixedName, value);
  if (result.success) {
    console.log(`\n  Set GitHub secret: ${prefixedName}`);
    updateEnvVariable(key, value);
    console.log(`  Updated .env: ${key}`);
    console.log('');
  } else {
    console.error(`\n  Failed to set ${prefixedName}: ${result.error}\n`);
    process.exit(1);
  }
}

async function setAgentLlmSecret(key, value) {
  if (!key) {
    console.error('\n  Usage: mantis-ai set-agent-llm-secret <KEY> [VALUE]\n');
    console.error('  Example: mantis-ai set-agent-llm-secret BRAVE_API_KEY\n');
    process.exit(1);
  }

  if (!value) value = await promptForValue(key);

  const { owner, repo } = loadRepoInfo();
  const prefixedName = `AGENT_LLM_${key}`;

  const { setSecret } = await import(path.join(__dirname, '..', 'setup', 'lib', 'github.mjs'));

  const result = await setSecret(owner, repo, prefixedName, value);
  if (result.success) {
    console.log(`\n  Set GitHub secret: ${prefixedName}\n`);
  } else {
    console.error(`\n  Failed to set ${prefixedName}: ${result.error}\n`);
    process.exit(1);
  }
}

async function setVar(key, value) {
  if (!key) {
    console.error('\n  Usage: mantis-ai set-var <KEY> [VALUE]\n');
    console.error('  Example: mantis-ai set-var LLM_MODEL claude-sonnet-4-5-20250929\n');
    process.exit(1);
  }

  if (!value) value = await promptForValue(key);

  const { owner, repo } = loadRepoInfo();

  const { setVariable } = await import(path.join(__dirname, '..', 'setup', 'lib', 'github.mjs'));

  const result = await setVariable(owner, repo, key, value);
  if (result.success) {
    console.log(`\n  Set GitHub variable: ${key}\n`);
  } else {
    console.error(`\n  Failed to set ${key}: ${result.error}\n`);
    process.exit(1);
  }
}

async function skills(subcommand, ...subArgs) {
  const packageDir = path.join(__dirname, '..');
  const skillsModule = path.join(packageDir, 'lib', 'skills', 'index.js');

  switch (subcommand) {
    case 'list': {
      const { listSkills } = await import(skillsModule);
      const installed = listSkills();
      if (installed.length === 0) {
        console.log('\n  No skills installed.\n');
        return;
      }
      console.log('\n  Installed skills:\n');
      for (const skill of installed) {
        const status = skill.enabled ? '\u2705' : '\u274c';
        console.log(`  ${status}  ${skill.name.padEnd(20)} ${skill.version.padEnd(10)} ${skill.source}`);
      }
      console.log('');
      break;
    }

    case 'search': {
      const query = subArgs[0];
      if (!query) {
        console.error('\n  Usage: mantis-ai skills search <query>\n');
        process.exit(1);
      }
      const { searchRegistry } = await import(skillsModule);
      console.log(`\n  Searching for "${query}"...\n`);
      try {
        const results = await searchRegistry(query);
        if (results.length === 0) {
          console.log('  No skills found.\n');
          return;
        }
        for (const skill of results) {
          console.log(`  ${skill.name.padEnd(25)} ${(skill.version || '').padEnd(10)} ${skill.description || ''}`);
        }
        console.log(`\n  ${results.length} skill(s) found.`);
        console.log('  Install with: mantis-ai skills install <name>\n');
      } catch (err) {
        console.error(`  Failed to search registry: ${err.message}\n`);
        process.exit(1);
      }
      break;
    }

    case 'install': {
      const name = subArgs[0];
      if (!name) {
        console.error('\n  Usage: mantis-ai skills install <name>\n');
        process.exit(1);
      }
      const { installSkill } = await import(skillsModule);
      console.log(`\n  Installing ${name}...`);
      try {
        const result = await installSkill(name);
        if (result.success) {
          console.log(`  ${result.message}\n`);
        } else {
          console.error(`  ${result.message}\n`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`  Failed: ${err.message}\n`);
        process.exit(1);
      }
      break;
    }

    case 'remove': {
      const name = subArgs[0];
      if (!name) {
        console.error('\n  Usage: mantis-ai skills remove <name>\n');
        process.exit(1);
      }
      const { removeSkill } = await import(skillsModule);
      const result = removeSkill(name);
      console.log(`\n  ${result.message}\n`);
      break;
    }

    case 'enable': {
      const name = subArgs[0];
      if (!name) {
        console.error('\n  Usage: mantis-ai skills enable <name>\n');
        process.exit(1);
      }
      const { toggleSkill } = await import(skillsModule);
      const result = toggleSkill(name, true);
      if (result.success) {
        console.log(`\n  ${result.message}\n`);
      } else {
        console.error(`\n  ${result.message}\n`);
        process.exit(1);
      }
      break;
    }

    case 'disable': {
      const name = subArgs[0];
      if (!name) {
        console.error('\n  Usage: mantis-ai skills disable <name>\n');
        process.exit(1);
      }
      const { toggleSkill } = await import(skillsModule);
      const result = toggleSkill(name, false);
      if (result.success) {
        console.log(`\n  ${result.message}\n`);
      } else {
        console.error(`\n  ${result.message}\n`);
        process.exit(1);
      }
      break;
    }

    case 'update': {
      const { checkUpdates, installSkill } = await import(skillsModule);
      console.log('\n  Checking for updates...');
      try {
        const updates = await checkUpdates();
        if (updates.length === 0) {
          console.log('  All skills are up to date.\n');
          return;
        }

        const targetName = subArgs[0];
        const toUpdate = targetName ? updates.filter((u) => u.name === targetName) : updates;

        if (toUpdate.length === 0) {
          console.log(`  ${targetName} is up to date.\n`);
          return;
        }

        for (const update of toUpdate) {
          console.log(`  ${update.name}: ${update.currentVersion} -> ${update.latestVersion}`);
          const result = await installSkill(update.name);
          console.log(`    ${result.success ? 'Updated' : 'Failed: ' + result.message}`);
        }
        console.log('');
      } catch (err) {
        console.error(`  Failed: ${err.message}\n`);
        process.exit(1);
      }
      break;
    }

    default:
      console.log(`
  Usage: mantis-ai skills <subcommand>

  Subcommands:
    list                List installed skills
    search <query>      Search the remote skill registry
    install <name>      Install a skill from the registry
    remove <name>       Remove an installed skill
    enable <name>       Enable a skill
    disable <name>      Disable a skill
    update [name]       Check for / apply skill updates
`);
      if (subcommand) process.exit(1);
  }
}

async function agents(subcommand, ...subArgs) {
  const cwd = process.cwd();
  const agentsBaseDir = path.join(cwd, 'config', 'agents');

  switch (subcommand) {
    case 'list': {
      if (!fs.existsSync(agentsBaseDir)) {
        console.log('\n  No agents configured.\n');
        console.log('  Create one with: mantis-ai agents create <name>\n');
        return;
      }

      const entries = fs.readdirSync(agentsBaseDir, { withFileTypes: true });
      const agentDirs = entries.filter((e) => e.isDirectory());

      if (agentDirs.length === 0) {
        console.log('\n  No agents configured.\n');
        return;
      }

      console.log('\n  Configured sub-agents:\n');
      for (const dir of agentDirs) {
        const configPath = path.join(agentsBaseDir, dir.name, 'config.json');
        let config = {};
        try {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch {}

        const status = config.enabled !== false ? '\u2705' : '\u274c';
        const desc = config.description || 'No description';
        console.log(`  ${status}  ${dir.name.padEnd(20)} ${desc}`);
      }
      console.log('');
      break;
    }

    case 'create': {
      const name = subArgs[0];
      if (!name) {
        console.error('\n  Usage: mantis-ai agents create <name>\n');
        process.exit(1);
      }

      const agentDir = path.join(agentsBaseDir, name);
      if (fs.existsSync(agentDir)) {
        console.error(`\n  Agent "${name}" already exists.\n`);
        process.exit(1);
      }

      fs.mkdirSync(agentDir, { recursive: true });

      // Create config.json
      const config = {
        name,
        description: `${name} specialist agent`,
        tools: ['create_job', 'get_job_status'],
        enabled: true,
      };
      fs.writeFileSync(
        path.join(agentDir, 'config.json'),
        JSON.stringify(config, null, 2) + '\n'
      );

      // Create AGENT.md
      const agentMd = `You are ${name}, a specialized sub-agent.

## Guidelines

- Focus on your specific area of expertise
- Use available tools when needed
- Provide clear, structured responses

## Current Date

{{datetime}}
`;
      fs.writeFileSync(path.join(agentDir, 'AGENT.md'), agentMd);

      console.log(`\n  Created agent: ${name}`);
      console.log(`  Config: config/agents/${name}/config.json`);
      console.log(`  Prompt: config/agents/${name}/AGENT.md`);
      console.log('\n  Restart the server to activate.\n');
      break;
    }

    case 'remove': {
      const name = subArgs[0];
      if (!name) {
        console.error('\n  Usage: mantis-ai agents remove <name>\n');
        process.exit(1);
      }

      const agentDir = path.join(agentsBaseDir, name);
      if (!fs.existsSync(agentDir)) {
        console.error(`\n  Agent "${name}" not found.\n`);
        process.exit(1);
      }

      fs.rmSync(agentDir, { recursive: true, force: true });
      console.log(`\n  Removed agent: ${name}\n`);
      break;
    }

    default:
      console.log(`
  Usage: mantis-ai agents <subcommand>

  Subcommands:
    list                List configured sub-agents
    create <name>       Scaffold a new sub-agent
    remove <name>       Remove a sub-agent
`);
      if (subcommand) process.exit(1);
  }
}

switch (command) {
  case 'init':
    await init();
    break;
  case 'setup':
    setup();
    break;
  case 'setup-telegram':
    setupTelegram();
    break;
  case 'setup-slack':
    setupSlack();
    break;
  case 'setup-discord':
    setupDiscord();
    break;
  case 'setup-whatsapp':
    setupWhatsapp();
    break;
  case 'reset-auth':
    await resetAuth();
    break;
  case 'reset':
    reset(args[0]);
    break;
  case 'diff':
    diff(args[0]);
    break;
  case 'set-agent-secret':
    await setAgentSecret(args[0], args[1]);
    break;
  case 'set-agent-llm-secret':
    await setAgentLlmSecret(args[0], args[1]);
    break;
  case 'set-var':
    await setVar(args[0], args[1]);
    break;
  case 'skills':
    await skills(args[0], ...args.slice(1));
    break;
  case 'agents':
    await agents(args[0], ...args.slice(1));
    break;
  default:
    printUsage();
    process.exit(command ? 1 : 0);
}
