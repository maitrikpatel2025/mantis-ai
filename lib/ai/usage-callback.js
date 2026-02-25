import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
const PRICING = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-opus-4-20250514": { input: 15, output: 75 },
  "claude-haiku-3-5-20241022": { input: 0.8, output: 4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 }
};
function estimateCost(model, promptTokens, completionTokens) {
  const pricing = PRICING[model];
  if (!pricing) return null;
  const inputCost = promptTokens / 1e6 * pricing.input;
  const outputCost = completionTokens / 1e6 * pricing.output;
  return Math.round((inputCost + outputCost) * 1e6);
}
class UsageTracker extends BaseCallbackHandler {
  name = "UsageTracker";
  _source;
  _threadId;
  _starts;
  constructor(source, threadId) {
    super();
    this._source = source;
    this._threadId = threadId;
    this._starts = /* @__PURE__ */ new Map();
  }
  async handleLLMStart(llm, _prompts, runId) {
    const llmAny = llm;
    const idArr = llmAny?.id;
    this._starts.set(runId, {
      startTime: Date.now(),
      model: idArr?.[2] || llmAny?.model || "unknown"
    });
  }
  async handleLLMEnd(output, runId) {
    const start = this._starts.get(runId);
    if (!start) return;
    this._starts.delete(runId);
    const durationMs = start.startTime ? Date.now() - start.startTime : 0;
    const llmOutput = output?.llmOutput;
    const usage = llmOutput?.tokenUsage || llmOutput?.usage || {};
    const promptTokens = usage.promptTokens || usage.prompt_tokens || usage.input_tokens || 0;
    const completionTokens = usage.completionTokens || usage.completion_tokens || usage.output_tokens || 0;
    const totalTokens = promptTokens + completionTokens;
    const model = start.model;
    let provider = "unknown";
    if (model.includes("claude")) provider = "anthropic";
    else if (model.includes("gpt") || model.includes("o1") || model.includes("o3")) provider = "openai";
    else if (model.includes("gemini")) provider = "google";
    else provider = process.env.LLM_PROVIDER || "unknown";
    const costUsd = estimateCost(model, promptTokens, completionTokens);
    try {
      const { recordUsage } = await import("../db/usage.js");
      recordUsage({
        threadId: this._threadId,
        model,
        provider,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: costUsd ?? void 0,
        durationMs,
        source: this._source
      });
    } catch (err) {
      console.error("[usage-tracker] Failed to record usage:", err.message);
    }
  }
}
function createUsageTracker(source, threadId) {
  return new UsageTracker(source, threadId);
}
export {
  createUsageTracker
};
