import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createModel } from "./model.js";
import { createJobTool, getJobStatusTool, getSystemTechnicalSpecsTool, getPiSkillCreationGuideTool, searchMemoryTool, saveMemoryTool, toolRegistry } from "./tools.js";
import { createWorkspaceTools } from "./workspace-tools.js";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { eventHandlerMd, mantisDb } from "../paths.js";
import { render_md } from "../utils/render-md.js";
function wrapToolWithPolicy(agentName, tool) {
  const originalFunc = tool.func;
  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    func: async (...args) => {
      const startTime = Date.now();
      let policy = "allow";
      let decision = "executed";
      try {
        const { getToolPolicy } = await import("../security/policies.js");
        policy = getToolPolicy(agentName, tool.name);
        if (policy === "deny") {
          decision = "blocked";
          try {
            const { logToolInvocation } = await import("../security/audit.js");
            logToolInvocation({
              agentName,
              toolName: tool.name,
              args: JSON.stringify(args[0] || {}),
              policy,
              decision,
              durationMs: Date.now() - startTime
            });
          } catch {
          }
          return `Tool "${tool.name}" is blocked by security policy. Contact an administrator.`;
        }
        if (policy === "ask") {
          const { createApprovalRequest, waitForApproval } = await import("../security/approval.js");
          const requestId = createApprovalRequest(agentName, tool.name, args[0] || {});
          console.log(`[security] Approval required for ${agentName}/${tool.name} \u2014 request ${requestId}`);
          const approvalDecision = await waitForApproval(requestId);
          if (approvalDecision !== "approved") {
            decision = "denied";
            try {
              const { logToolInvocation } = await import("../security/audit.js");
              logToolInvocation({
                agentName,
                toolName: tool.name,
                args: JSON.stringify(args[0] || {}),
                policy,
                decision,
                durationMs: Date.now() - startTime
              });
            } catch {
            }
            return `Tool "${tool.name}" execution was ${approvalDecision}. The request was not approved.`;
          }
          decision = "approved";
        }
      } catch (err) {
        console.error("[security] Policy check failed:", err.message);
      }
      const result = await originalFunc.apply(tool, args);
      try {
        const { logToolInvocation } = await import("../security/audit.js");
        logToolInvocation({
          agentName,
          toolName: tool.name,
          args: JSON.stringify(args[0] || {}),
          result: typeof result === "string" ? result.slice(0, 500) : void 0,
          policy,
          decision,
          durationMs: Date.now() - startTime
        });
      } catch {
      }
      return result;
    }
  });
}
const _agents = /* @__PURE__ */ new Map();
async function getAgent(modelId) {
  const key = modelId || "_default";
  if (_agents.has(key)) return _agents.get(key);
  const modelOptions = modelId ? { model: modelId } : {};
  const model = await createModel(modelOptions);
  const tools = [
    createJobTool,
    getJobStatusTool,
    getSystemTechnicalSpecsTool,
    getPiSkillCreationGuideTool,
    searchMemoryTool,
    saveMemoryTool
  ];
  tools.push(...createWorkspaceTools());
  try {
    const { createDelegateTool } = await import("./delegate-tool.js");
    const delegateTool = createDelegateTool(toolRegistry);
    if (delegateTool) {
      tools.push(delegateTool);
    }
  } catch {
  }
  const wrappedTools = tools.map((t) => wrapToolWithPolicy("default", t));
  const checkpointer = SqliteSaver.fromConnString(mantisDb);
  const agent = createReactAgent({
    llm: model,
    tools: wrappedTools,
    checkpointSaver: checkpointer,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prompt: ((state) => [new SystemMessage(render_md(eventHandlerMd)), ...state.messages])
  });
  _agents.set(key, agent);
  return agent;
}
function resetAgent() {
  _agents.clear();
}
export {
  getAgent,
  resetAgent
};
