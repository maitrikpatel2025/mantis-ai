import path from 'path';

/**
 * Central path resolver for Mantis AI.
 * All paths resolve from process.cwd() (the user's project root).
 */

const PROJECT_ROOT: string = process.cwd();

export { PROJECT_ROOT };

// config/ files
export const configDir: string = path.join(PROJECT_ROOT, 'config');
export const cronsFile: string = path.join(PROJECT_ROOT, 'config', 'CRONS.json');
export const triggersFile: string = path.join(PROJECT_ROOT, 'config', 'TRIGGERS.json');
export const eventHandlerMd: string = path.join(PROJECT_ROOT, 'config', 'EVENT_HANDLER.md');
export const jobSummaryMd: string = path.join(PROJECT_ROOT, 'config', 'JOB_SUMMARY.md');
export const soulMd: string = path.join(PROJECT_ROOT, 'config', 'SOUL.md');
export const claudeMd: string = path.join(PROJECT_ROOT, 'CLAUDE.md');
export const skillGuidePath: string = path.join(PROJECT_ROOT, 'config', 'PI_SKILL_GUIDE.md');

// Pi skills
export const piSkillsDir: string = path.join(PROJECT_ROOT, '.pi', 'skills');
export const piSkillsSourceDir: string = path.join(PROJECT_ROOT, 'pi-skills');

// Skills registry
export const skillsFile: string = path.join(PROJECT_ROOT, 'config', 'SKILLS.json');

// Channels
export const channelsFile: string = path.join(PROJECT_ROOT, 'config', 'CHANNELS.json');

// Models catalog
export const modelsFile: string = path.join(PROJECT_ROOT, 'config', 'MODELS.json');

// Sub-agents
export const agentsDir: string = path.join(PROJECT_ROOT, 'config', 'agents');

// Working directories for command-type actions
export const cronDir: string = path.join(PROJECT_ROOT, 'cron');
export const triggersDir: string = path.join(PROJECT_ROOT, 'triggers');

// Logs
export const logsDir: string = path.join(PROJECT_ROOT, 'logs');

// Data (SQLite memory, etc.)
export const dataDir: string = path.join(PROJECT_ROOT, 'data');

// Database
export const mantisDb: string = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'data', 'mantis.sqlite');

// .env
export const envFile: string = path.join(PROJECT_ROOT, '.env');
