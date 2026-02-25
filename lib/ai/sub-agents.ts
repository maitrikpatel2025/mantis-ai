import fs from 'fs';
import path from 'path';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { createModel } from './model.js';
import { agentsDir, mantisDb } from '../paths.js';
import { render_md } from '../utils/render-md.js';

/** Agent graph type - uses Runnable interface for invoke/stream */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentGraph = ReturnType<typeof createReactAgent>;

export interface AgentConfig {
  _name: string;
  _dir: string;
  _agentMdPath: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  model?: string;
  max_tokens?: number;
  tools?: string[];
  [key: string]: unknown;
}

export type ToolRegistry = Record<string, unknown>;

/** name -> LangGraph agent */
const _subAgents: Map<string, AgentGraph> = new Map();

/**
 * Load all agent configs from config/agents/.
 * Each agent has a directory with config.json and AGENT.md.
 */
export function loadAgentConfigs(): AgentConfig[] {
  const configs: AgentConfig[] = [];

  try {
    if (!fs.existsSync(agentsDir)) return configs;

    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const configPath = path.join(agentsDir, entry.name, 'config.json');
      const agentMdPath = path.join(agentsDir, entry.name, 'AGENT.md');

      if (!fs.existsSync(configPath)) continue;

      try {
        const config: AgentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config._name = config.name || entry.name;
        config._dir = path.join(agentsDir, entry.name);
        config._agentMdPath = agentMdPath;

        if (config.enabled !== false) {
          configs.push(config);
        }
      } catch (err: unknown) {
        console.error(`[sub-agents] Failed to load config for ${entry.name}:`, (err as Error).message);
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable — return empty
  }

  return configs;
}

/**
 * Get or create a sub-agent by name.
 * Each sub-agent is a LangGraph agent with its own system prompt and tools.
 */
export async function getSubAgent(
  name: string,
  toolRegistry: ToolRegistry = {}
): Promise<AgentGraph> {
  const cached = _subAgents.get(name);
  if (cached) return cached;

  const configs = loadAgentConfigs();
  const config = configs.find((c) => c._name === name);
  if (!config) {
    throw new Error(`Sub-agent "${name}" not found or not enabled`);
  }

  // Resolve tools for this sub-agent
  const tools: StructuredToolInterface[] = [];
  if (config.tools && Array.isArray(config.tools)) {
    for (const toolName of config.tools) {
      if (toolRegistry[toolName]) {
        tools.push(toolRegistry[toolName] as StructuredToolInterface);
      }
    }
  }

  // Create model (may override per-agent)
  const modelOptions: { model?: string; maxTokens?: number } = {};
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
    prompt: (state: { messages: BaseMessage[] }) => {
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
export function resetSubAgents(): void {
  _subAgents.clear();
}
