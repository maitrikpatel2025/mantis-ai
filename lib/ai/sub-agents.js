import fs from "fs";
import path from "path";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { createModel } from "./model.js";
import { agentsDir, mantisDb } from "../paths.js";
import { render_md } from "../utils/render-md.js";
const _subAgents = /* @__PURE__ */ new Map();
function loadAgentConfigs() {
  const configs = [];
  try {
    if (!fs.existsSync(agentsDir)) return configs;
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(agentsDir, entry.name, "config.json");
      const agentMdPath = path.join(agentsDir, entry.name, "AGENT.md");
      if (!fs.existsSync(configPath)) continue;
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        config._name = config.name || entry.name;
        config._dir = path.join(agentsDir, entry.name);
        config._agentMdPath = agentMdPath;
        if (config.enabled !== false) {
          configs.push(config);
        }
      } catch (err) {
        console.error(`[sub-agents] Failed to load config for ${entry.name}:`, err.message);
      }
    }
  } catch {
  }
  return configs;
}
async function getSubAgent(name, toolRegistry = {}) {
  const cached = _subAgents.get(name);
  if (cached) return cached;
  const configs = loadAgentConfigs();
  const config = configs.find((c) => c._name === name);
  if (!config) {
    throw new Error(`Sub-agent "${name}" not found or not enabled`);
  }
  const tools = [];
  if (config.tools && Array.isArray(config.tools)) {
    for (const toolName of config.tools) {
      if (toolRegistry[toolName]) {
        tools.push(toolRegistry[toolName]);
      }
    }
  }
  const modelOptions = {};
  if (config.model) modelOptions.model = config.model;
  if (config.max_tokens) modelOptions.maxTokens = config.max_tokens;
  const model = await createModel(modelOptions);
  const checkpointer = SqliteSaver.fromConnString(mantisDb);
  const agentMdPath = config._agentMdPath;
  const agent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: checkpointer,
    prompt: (state) => {
      const systemPrompt = fs.existsSync(agentMdPath) ? render_md(agentMdPath) : `You are ${name}. ${config.description || ""}`;
      return [new SystemMessage(systemPrompt), ...state.messages];
    }
  });
  _subAgents.set(name, agent);
  return agent;
}
function resetSubAgents() {
  _subAgents.clear();
}
export {
  getSubAgent,
  loadAgentConfigs,
  resetSubAgents
};
