import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { v4 as uuid } from "uuid";
import { loadAgentConfigs, getSubAgent } from "./sub-agents.js";
const MAX_DELEGATIONS = 5;
function createDelegateTool(toolRegistry = {}) {
  const configs = loadAgentConfigs();
  if (configs.length === 0) return null;
  const agentNames = configs.map((c) => c._name);
  const agentDescriptions = configs.map((c) => `- **${c._name}**: ${c.description || "No description"}`).join("\n");
  return tool(
    async ({ agent_name, task, thread_id }) => {
      if (!agentNames.includes(agent_name)) {
        return JSON.stringify({ error: `Unknown agent: ${agent_name}. Available: ${agentNames.join(", ")}` });
      }
      try {
        const subAgent = await getSubAgent(agent_name, toolRegistry);
        const threadId = thread_id || `sub-${agent_name}-${uuid().slice(0, 8)}`;
        const result = await subAgent.invoke(
          { messages: [new HumanMessage(task)] },
          {
            configurable: { thread_id: threadId },
            recursionLimit: MAX_DELEGATIONS * 10
            // Each agent step counts as recursion
          }
        );
        const messages = result.messages || [];
        const lastAiMessage = [...messages].reverse().find((m) => {
          const getType = m._getType;
          return getType?.() === "ai";
        });
        const responseText = lastAiMessage?.content || "Sub-agent completed with no response.";
        return JSON.stringify({
          agent: agent_name,
          thread_id: threadId,
          response: typeof responseText === "string" ? responseText : JSON.stringify(responseText)
        });
      } catch (err) {
        console.error(`[delegate] Error delegating to ${agent_name}:`, err.message);
        return JSON.stringify({ error: `Delegation to ${agent_name} failed: ${err.message}` });
      }
    },
    {
      name: "delegate_to_agent",
      description: `Delegate a task to a specialized sub-agent. The sub-agent will execute the task using its own system prompt and tools, then return the result.

Available agents:
${agentDescriptions}`,
      schema: z.object({
        agent_name: z.enum(agentNames).describe("Name of the sub-agent to delegate to"),
        task: z.string().describe("Detailed task description for the sub-agent"),
        thread_id: z.string().optional().describe("Optional thread ID for conversation continuity with this sub-agent")
      })
    }
  );
}
export {
  createDelegateTool
};
