import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createModel } from './model.js';
import { createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, getPiSkillCreationGuideTool, searchMemoryTool, saveMemoryTool, toolRegistry } from './tools.js';
import { createWorkspaceTools } from './workspace-tools.js';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { eventHandlerMd, mantisDb } from '../paths.js';
import { render_md } from '../utils/render-md.js';
import type { AuditLogEntry, ToolPolicyDecision } from '../types.js';

/**
 * Wrap a tool with security policy enforcement.
 * 'allow' = pass through, 'deny' = return error, 'ask' = wait for approval.
 */
function wrapToolWithPolicy(agentName: string, tool: DynamicStructuredTool): DynamicStructuredTool {
  const originalFunc = tool.func;

  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    func: async (...args: any[]) => {
      const startTime = Date.now();
      let policy: ToolPolicyDecision = 'allow';
      let decision: AuditLogEntry['decision'] = 'executed';

      try {
        const { getToolPolicy } = await import('../security/policies.js');
        policy = getToolPolicy(agentName, tool.name);

        if (policy === 'deny') {
          decision = 'blocked';
          // Log to audit
          try {
            const { logToolInvocation } = await import('../security/audit.js');
            logToolInvocation({
              agentName,
              toolName: tool.name,
              args: JSON.stringify(args[0] || {}),
              policy,
              decision,
              durationMs: Date.now() - startTime,
            });
          } catch { /* audit is best-effort */ }
          return `Tool "${tool.name}" is blocked by security policy. Contact an administrator.`;
        }

        if (policy === 'ask') {
          const { createApprovalRequest, waitForApproval } = await import('../security/approval.js');
          const requestId = createApprovalRequest(agentName, tool.name, (args[0] as Record<string, unknown>) || {});
          console.log(`[security] Approval required for ${agentName}/${tool.name} — request ${requestId}`);
          const approvalDecision = await waitForApproval(requestId);
          if (approvalDecision !== 'approved') {
            decision = 'denied';
            try {
              const { logToolInvocation } = await import('../security/audit.js');
              logToolInvocation({
                agentName,
                toolName: tool.name,
                args: JSON.stringify(args[0] || {}),
                policy,
                decision,
                durationMs: Date.now() - startTime,
              });
            } catch { /* audit is best-effort */ }
            return `Tool "${tool.name}" execution was ${approvalDecision}. The request was not approved.`;
          }
          decision = 'approved';
        }
      } catch (err: unknown) {
        // If security module fails, allow by default
        console.error('[security] Policy check failed:', (err as Error).message);
      }

      const result = await (originalFunc as Function).apply(tool, args);

      // Log successful execution to audit
      try {
        const { logToolInvocation } = await import('../security/audit.js');
        logToolInvocation({
          agentName,
          toolName: tool.name,
          args: JSON.stringify(args[0] || {}),
          result: typeof result === 'string' ? result.slice(0, 500) : undefined,
          policy,
          decision,
          durationMs: Date.now() - startTime,
        });
      } catch { /* audit is best-effort */ }

      return result;
    },
  });
}

const _agents = new Map<string, unknown>();

/**
 * Get or create a LangGraph agent, optionally for a specific model.
 * Uses createReactAgent which handles the tool loop automatically.
 * Prompt is a function so {{datetime}} resolves fresh each invocation.
 * Conditionally adds delegate_to_agent tool if sub-agents are configured.
 */
export async function getAgent(modelId?: string): Promise<unknown> {
  const key = modelId || '_default';
  if (_agents.has(key)) return _agents.get(key)!;

  const modelOptions = modelId ? { model: modelId } : {};
  const model = await createModel(modelOptions);
  const tools: DynamicStructuredTool[] = [
    createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool,
    getPiSkillCreationGuideTool, searchMemoryTool, saveMemoryTool,
  ] as unknown as DynamicStructuredTool[];

  // Add workspace tools if enabled
  tools.push(...createWorkspaceTools() as DynamicStructuredTool[]);

  // Conditionally add sub-agent delegation tool
  try {
    const { createDelegateTool } = await import('./delegate-tool.js');
    const delegateTool = createDelegateTool(toolRegistry);
    if (delegateTool) {
      tools.push(delegateTool as DynamicStructuredTool);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prompt: ((state: { messages: BaseMessage[] }): BaseMessage[] => [new SystemMessage(render_md(eventHandlerMd)), ...state.messages]) as any,
  });

  _agents.set(key, agent);
  return agent;
}

/**
 * Reset all agent instances (e.g., when config changes).
 */
export function resetAgent(): void {
  _agents.clear();
}
