import fs from 'fs';
import path from 'path';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage } from '@langchain/core/messages';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { createModel } from './model.js';
import { agentsDir, mantisDb } from '../paths.js';
import { render_md } from '../utils/render-md.js';

/** @type {Map<string, object>} name -> LangGraph agent */
const _subAgents = new Map();

/**
 * Load all agent configs from config/agents/.
 * Each agent has a directory with config.json and AGENT.md.
 * @returns {object[]} Array of agent config objects
 */
export function loadAgentConfigs() {
  const configs = [];

  try {
    if (!fs.existsSync(agentsDir)) return configs;

    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const configPath = path.join(agentsDir, entry.name, 'config.json');
      const agentMdPath = path.join(agentsDir, entry.name, 'AGENT.md');

      if (!fs.existsSync(configPath)) continue;

      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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
  } catch {}

  return configs;
}

/**
 * Get or create a sub-agent by name.
 * Each sub-agent is a LangGraph agent with its own system prompt and tools.
 * @param {string} name - Agent name
 * @param {object} [toolRegistry] - Map of tool name -> tool instance
 * @returns {Promise<object>} LangGraph agent
 */
export async function getSubAgent(name, toolRegistry = {}) {
  if (_subAgents.has(name)) return _subAgents.get(name);

  const configs = loadAgentConfigs();
  const config = configs.find((c) => c._name === name);
  if (!config) {
    throw new Error(`Sub-agent "${name}" not found or not enabled`);
  }

  // Resolve tools for this sub-agent
  const tools = [];
  if (config.tools && Array.isArray(config.tools)) {
    for (const toolName of config.tools) {
      if (toolRegistry[toolName]) {
        tools.push(toolRegistry[toolName]);
      }
    }
  }

  // Create model (may override per-agent)
  const modelOptions = {};
  if (config.model) modelOptions.model = config.model;
  if (config.max_tokens) modelOptions.maxTokens = config.max_tokens;
  const model = await createModel(modelOptions);

  // Create checkpointer with sub-agent namespace
  const checkpointer = SqliteSaver.fromConnString(mantisDb);

  // Load system prompt from AGENT.md
  const agentMdPath = config._agentMdPath;

  const agent = createReactAgent({
    llm: model,
    tools,
    checkpointSaver: checkpointer,
    prompt: (state) => {
      const systemPrompt = fs.existsSync(agentMdPath)
        ? render_md(agentMdPath)
        : `You are ${name}. ${config.description || ''}`;
      return [new SystemMessage(systemPrompt), ...state.messages];
    },
  });

  _subAgents.set(name, agent);
  return agent;
}

/**
 * Reset all sub-agent singletons.
 */
export function resetSubAgents() {
  _subAgents.clear();
}
