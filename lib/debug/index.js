import fs from "fs";
import {
  mantisDb,
  cronsFile,
  triggersFile,
  channelsFile,
  eventHandlerMd,
  soulMd,
  agentsDir,
  modelsFile,
  skillsFile
} from "../paths.js";
async function getDebugInfo() {
  const info = {
    env: {},
    configFiles: {},
    channels: [],
    tools: [],
    agents: [],
    db: {},
    recentErrors: []
  };
  const envKeys = [
    "APP_URL",
    "LLM_PROVIDER",
    "LLM_MODEL",
    "LLM_MAX_TOKENS",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "CUSTOM_API_KEY",
    "OPENAI_BASE_URL",
    "GH_OWNER",
    "GH_REPO",
    "GH_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "DATABASE_PATH",
    "AUTH_TRUST_HOST"
  ];
  for (const key of envKeys) {
    const val = process.env[key];
    if (!val) {
      info.env[key] = null;
    } else if (key.includes("KEY") || key.includes("TOKEN") || key.includes("SECRET")) {
      info.env[key] = `set (${val.length} chars)`;
    } else {
      info.env[key] = val;
    }
  }
  const configChecks = {
    "CRONS.json": cronsFile,
    "TRIGGERS.json": triggersFile,
    "CHANNELS.json": channelsFile,
    "EVENT_HANDLER.md": eventHandlerMd,
    "SOUL.md": soulMd,
    "MODELS.json": modelsFile,
    "SKILLS.json": skillsFile
  };
  for (const [name, filepath] of Object.entries(configChecks)) {
    info.configFiles[name] = fs.existsSync(filepath);
  }
  try {
    const { getChannelRegistry } = await import("../channels/registry.js");
    info.channels = getChannelRegistry().getAll().map((c) => ({
      id: c.id,
      type: c.type,
      enabled: c.enabled
    }));
  } catch {
  }
  try {
    const { toolRegistry } = await import("../ai/tools.js");
    info.tools = Object.keys(toolRegistry);
  } catch {
  }
  try {
    if (fs.existsSync(agentsDir)) {
      info.agents = fs.readdirSync(agentsDir).filter((d) => {
        try {
          return fs.statSync(`${agentsDir}/${d}`).isDirectory();
        } catch {
          return false;
        }
      });
    }
  } catch {
  }
  try {
    info.db.sizeBytes = fs.existsSync(mantisDb) ? fs.statSync(mantisDb).size : 0;
    const { getDb } = await import("../db/index.js");
    const db = getDb();
    const tables = ["users", "chats", "messages", "notifications", "settings", "usage_logs"];
    info.db.rowCounts = {};
    for (const table of tables) {
      try {
        const row = db.all(`SELECT COUNT(*) as count FROM ${table}`);
        info.db.rowCounts[table] = row[0]?.count || 0;
      } catch {
        info.db.rowCounts[table] = null;
      }
    }
  } catch {
  }
  try {
    const { getLogBuffer } = await import("../logs/buffer.js");
    const errors = getLogBuffer().getAll({ level: "error" });
    info.recentErrors = errors.slice(-10);
  } catch {
  }
  return info;
}
async function testLlmConnection() {
  try {
    const { createModel } = await import("../ai/model.js");
    const model = await createModel({ maxTokens: 50 });
    const start = Date.now();
    const response = await model.invoke([["human", 'Say "ok" and nothing else.']]);
    const latencyMs = Date.now() - start;
    const text = typeof response.content === "string" ? response.content : response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return {
      success: true,
      latencyMs,
      model: process.env.LLM_MODEL || "default",
      response: text.slice(0, 100)
    };
  } catch (err) {
    return { success: false, latencyMs: 0, model: "", error: err.message };
  }
}
async function resetAgentCache() {
  try {
    const { resetAgent } = await import("../ai/agent.js");
    resetAgent();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
async function clearCheckpoints() {
  try {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(mantisDb);
    try {
      db.exec("DELETE FROM checkpoints");
    } catch {
    }
    try {
      db.exec("DELETE FROM checkpoint_writes");
    } catch {
    }
    db.close();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
export {
  clearCheckpoints,
  getDebugInfo,
  resetAgentCache,
  testLlmConnection
};
