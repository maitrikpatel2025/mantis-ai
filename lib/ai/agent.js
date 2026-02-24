import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createModel } from './model.js';
import { createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, getPiSkillCreationGuideTool, searchMemoryTool, saveMemoryTool, toolRegistry } from './tools.js';
import { createWorkspaceTools } from './workspace-tools.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { eventHandlerMd, mantisDb } from '../paths.js';
import { render_md } from '../utils/render-md.js';

/**
 * Wrap a tool with security policy enforcement.
 * 'allow' = pass through, 'deny' = return error, 'ask' = wait for approval.
 */
function wrapToolWithPolicy(agentName, tool) {
  const originalFunc = tool.func;

  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    func: async (...args) => {
      try {
        const { getToolPolicy } = await import('../security/policies.js');
        const policy = getToolPolicy(agentName, tool.name);

        if (policy === 'deny') {
          return `Tool "${tool.name}" is blocked by security policy. Contact an administrator.`;
        }

        if (policy === 'ask') {
          const { createApprovalRequest, waitForApproval } = await import('../security/approval.js');
          const requestId = createApprovalRequest(agentName, tool.name, args[0] || {});
          console.log(`[security] Approval required for ${agentName}/${tool.name} — request ${requestId}`);
          const decision = await waitForApproval(requestId);
          if (decision !== 'approved') {
            return `Tool "${tool.name}" execution was ${decision}. The request was not approved.`;
          }
        }
      } catch (err) {
        // If security module fails, allow by default
        console.error('[security] Policy check failed:', err.message);
      }
      return originalFunc.call(tool, ...args);
    },
  });
}

/** @type {Map<string, object>} modelId -> LangGraph agent */
const _agents = new Map();

/**
 * Get or create a LangGraph agent, optionally for a specific model.
 * Uses createReactAgent which handles the tool loop automatically.
 * Prompt is a function so {{datetime}} resolves fresh each invocation.
 * Conditionally adds delegate_to_agent tool if sub-agents are configured.
 *
 * @param {string} [modelId] - Model spec (e.g. "anthropic/claude-opus-4-6"). Uses env defaults if omitted.
 * @returns {Promise<object>} LangGraph agent
 */
export async function getAgent(modelId) {
  const key = modelId || '_default';
  if (_agents.has(key)) return _agents.get(key);

  const modelOptions = modelId ? { model: modelId } : {};
  const model = await createModel(modelOptions);
  const tools = [createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, getPiSkillCreationGuideTool, searchMemoryTool, saveMemoryTool];

  // Add workspace tools if enabled (run_command, workspace_read_file, workspace_write_file, install_package)
  tools.push(...createWorkspaceTools());

  // Conditionally add sub-agent delegation tool
  try {
    const { createDelegateTool } = await import('./delegate-tool.js');
    const delegateTool = createDelegateTool(toolRegistry);
    if (delegateTool) {
      tools.push(delegateTool);
    }
  } catch {
    // No sub-agents configured or import failed — graceful no-op
  }

  // Wrap tools with security policy enforcement
  const wrappedTools = tools.map((t) => wrapToolWithPolicy('default', t));

  const checkpointer = SqliteSaver.fromConnString(mantisDb);

  const agent = createReactAgent({
    llm: model,
    tools: wrappedTools,
    checkpointSaver: checkpointer,
    prompt: (state) => [new SystemMessage(render_md(eventHandlerMd)), ...state.messages],
  });

  _agents.set(key, agent);
  return agent;
}

/**
 * Reset all agent instances (e.g., when config changes).
 */
export function resetAgent() {
  _agents.clear();
}
