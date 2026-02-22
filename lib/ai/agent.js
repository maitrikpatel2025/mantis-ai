import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage } from '@langchain/core/messages';
import { createModel } from './model.js';
import { createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, getPiSkillCreationGuideTool, toolRegistry } from './tools.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { eventHandlerMd, mantisDb } from '../paths.js';
import { render_md } from '../utils/render-md.js';

let _agent = null;

/**
 * Get or create the LangGraph agent singleton.
 * Uses createReactAgent which handles the tool loop automatically.
 * Prompt is a function so {{datetime}} resolves fresh each invocation.
 * Conditionally adds delegate_to_agent tool if sub-agents are configured.
 */
export async function getAgent() {
  if (!_agent) {
    const model = await createModel();
    const tools = [createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, getPiSkillCreationGuideTool];

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

    const checkpointer = SqliteSaver.fromConnString(mantisDb);

    _agent = createReactAgent({
      llm: model,
      tools,
      checkpointSaver: checkpointer,
      prompt: (state) => [new SystemMessage(render_md(eventHandlerMd)), ...state.messages],
    });
  }
  return _agent;
}

/**
 * Reset the agent singleton (e.g., when config changes).
 */
export function resetAgent() {
  _agent = null;
}
