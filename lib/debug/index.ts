import fs from 'fs';
import {
  mantisDb,
  cronsFile,
  triggersFile,
  channelsFile,
  eventHandlerMd,
  soulMd,
  agentsDir,
  modelsFile,
  skillsFile,
} from '../paths.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DebugInfo {
  env: Record<string, string | null>;
  configFiles: Record<string, boolean>;
  channels: Array<{ id: string; type: string; enabled: boolean }>;
  tools: string[];
  agents: string[];
  db: {
    sizeBytes?: number;
    rowCounts?: Record<string, number | null>;
  };
  recentErrors: unknown[];
}

interface LlmTestResult {
  success: boolean;
  latencyMs: number;
  model: string;
  response?: string;
  error?: string;
}

interface OperationResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Gather debug/diagnostic information about the running instance.
 */
export async function getDebugInfo(): Promise<DebugInfo> {
  const info: DebugInfo = {
    env: {},
    configFiles: {},
    channels: [],
    tools: [],
    agents: [],
    db: {},
    recentErrors: [],
  };

  // Sanitized env vars (show presence, not values for secrets)
  const envKeys: string[] = [
    'APP_URL', 'LLM_PROVIDER', 'LLM_MODEL', 'LLM_MAX_TOKENS',
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'CUSTOM_API_KEY',
    'OPENAI_BASE_URL', 'GH_OWNER', 'GH_REPO', 'GH_TOKEN',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'DATABASE_PATH', 'AUTH_TRUST_HOST',
  ];
  for (const key of envKeys) {
    const val = process.env[key];
    if (!val) {
      info.env[key] = null;
    } else if (key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET')) {
      info.env[key] = `set (${val.length} chars)`;
    } else {
      info.env[key] = val;
    }
  }

  // Config file existence
  const configChecks: Record<string, string> = {
    'CRONS.json': cronsFile,
    'TRIGGERS.json': triggersFile,
    'CHANNELS.json': channelsFile,
    'EVENT_HANDLER.md': eventHandlerMd,
    'SOUL.md': soulMd,
    'MODELS.json': modelsFile,
    'SKILLS.json': skillsFile,
  };
  for (const [name, filepath] of Object.entries(configChecks)) {
    info.configFiles[name] = fs.existsSync(filepath);
  }

  // Registered channels
  try {
    const { getChannelRegistry } = await import('../channels/registry.js');
    info.channels = getChannelRegistry().getAll().map((c: { id: string; type: string; enabled: boolean }) => ({
      id: c.id, type: c.type, enabled: c.enabled,
    }));
  } catch {}

  // Tools
  try {
    const { toolRegistry } = await import('../ai/tools.js');
    info.tools = Object.keys(toolRegistry);
  } catch {}

  // Agents
  try {
    if (fs.existsSync(agentsDir)) {
      info.agents = fs.readdirSync(agentsDir).filter((d: string) => {
        try { return fs.statSync(`${agentsDir}/${d}`).isDirectory(); } catch { return false; }
      });
    }
  } catch {}

  // DB stats
  try {
    info.db.sizeBytes = fs.existsSync(mantisDb) ? fs.statSync(mantisDb).size : 0;
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const tables: string[] = ['users', 'chats', 'messages', 'notifications', 'settings', 'usage_logs'];
    info.db.rowCounts = {};
    for (const table of tables) {
      try {
        const row = db.all(`SELECT COUNT(*) as count FROM ${table}`) as Array<{ count: number }>;
        info.db.rowCounts[table] = row[0]?.count || 0;
      } catch {
        info.db.rowCounts[table] = null;
      }
    }
  } catch {}

  // Recent errors from log buffer
  try {
    const { getLogBuffer } = await import('../logs/buffer.js');
    const errors = getLogBuffer().getAll({ level: 'error' });
    info.recentErrors = errors.slice(-10);
  } catch {}

  return info;
}

/**
 * Test the LLM connection by sending a simple message.
 */
export async function testLlmConnection(): Promise<LlmTestResult> {
  try {
    const { createModel } = await import('../ai/model.js');
    const model = await createModel({ maxTokens: 50 });
    const start = Date.now();
    const response = await model.invoke([['human', 'Say "ok" and nothing else.']]);
    const latencyMs = Date.now() - start;
    const text = typeof response.content === 'string'
      ? response.content
      : (response.content as Array<{ type: string; text: string }>).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return {
      success: true,
      latencyMs,
      model: process.env.LLM_MODEL || 'default',
      response: text.slice(0, 100),
    };
  } catch (err) {
    return { success: false, latencyMs: 0, model: '', error: (err as Error).message };
  }
}

/**
 * Reset agent cache.
 */
export async function resetAgentCache(): Promise<OperationResult> {
  try {
    const { resetAgent } = await import('../ai/agent.js');
    resetAgent();
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Clear LangGraph checkpoint data.
 */
export async function clearCheckpoints(): Promise<OperationResult> {
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(mantisDb);
    try { db.exec('DELETE FROM checkpoints'); } catch {}
    try { db.exec('DELETE FROM checkpoint_writes'); } catch {}
    db.close();
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
