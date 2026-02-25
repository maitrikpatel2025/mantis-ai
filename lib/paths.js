import path from "path";
const PROJECT_ROOT = process.cwd();
const configDir = path.join(PROJECT_ROOT, "config");
const cronsFile = path.join(PROJECT_ROOT, "config", "CRONS.json");
const triggersFile = path.join(PROJECT_ROOT, "config", "TRIGGERS.json");
const eventHandlerMd = path.join(PROJECT_ROOT, "config", "EVENT_HANDLER.md");
const jobSummaryMd = path.join(PROJECT_ROOT, "config", "JOB_SUMMARY.md");
const soulMd = path.join(PROJECT_ROOT, "config", "SOUL.md");
const claudeMd = path.join(PROJECT_ROOT, "CLAUDE.md");
const skillGuidePath = path.join(PROJECT_ROOT, "config", "PI_SKILL_GUIDE.md");
const piSkillsDir = path.join(PROJECT_ROOT, ".pi", "skills");
const piSkillsSourceDir = path.join(PROJECT_ROOT, "pi-skills");
const skillsFile = path.join(PROJECT_ROOT, "config", "SKILLS.json");
const channelsFile = path.join(PROJECT_ROOT, "config", "CHANNELS.json");
const modelsFile = path.join(PROJECT_ROOT, "config", "MODELS.json");
const agentsDir = path.join(PROJECT_ROOT, "config", "agents");
const cronDir = path.join(PROJECT_ROOT, "cron");
const triggersDir = path.join(PROJECT_ROOT, "triggers");
const logsDir = path.join(PROJECT_ROOT, "logs");
const dataDir = path.join(PROJECT_ROOT, "data");
const mantisDb = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, "data", "mantis.sqlite");
const envFile = path.join(PROJECT_ROOT, ".env");
export {
  PROJECT_ROOT,
  agentsDir,
  channelsFile,
  claudeMd,
  configDir,
  cronDir,
  cronsFile,
  dataDir,
  envFile,
  eventHandlerMd,
  jobSummaryMd,
  logsDir,
  mantisDb,
  modelsFile,
  piSkillsDir,
  piSkillsSourceDir,
  skillGuidePath,
  skillsFile,
  soulMd,
  triggersDir,
  triggersFile
};
