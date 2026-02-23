'use strict';

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';

// Pricing per 1M tokens (input/output) in USD
const PRICING = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
};

function estimateCost(model, promptTokens, completionTokens) {
  const pricing = PRICING[model];
  if (!pricing) return null;
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  // Return microdollars (x1e6)
  return Math.round((inputCost + outputCost) * 1_000_000);
}

/**
 * LangChain callback handler that tracks LLM token usage and cost.
 */
class UsageTracker extends BaseCallbackHandler {
  name = 'UsageTracker';

  constructor(source, threadId) {
    super();
    this._source = source;
    this._threadId = threadId;
    this._starts = new Map();
  }

  async handleLLMStart(llm, _prompts, runId) {
    this._starts.set(runId, { startTime: Date.now(), model: llm?.id?.[2] || llm?.model || 'unknown' });
  }

  async handleLLMEnd(output, runId) {
    const start = this._starts.get(runId);
    if (!start) return;
    this._starts.delete(runId);

    const durationMs = Date.now() - start.startTime;
    const usage = output?.llmOutput?.tokenUsage || output?.llmOutput?.usage || {};

    const promptTokens = usage.promptTokens || usage.prompt_tokens || usage.input_tokens || 0;
    const completionTokens = usage.completionTokens || usage.completion_tokens || usage.output_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    // Detect provider from model name
    const model = start.model;
    let provider = 'unknown';
    if (model.includes('claude')) provider = 'anthropic';
    else if (model.includes('gpt') || model.includes('o1') || model.includes('o3')) provider = 'openai';
    else if (model.includes('gemini')) provider = 'google';
    else provider = process.env.LLM_PROVIDER || 'unknown';

    const costUsd = estimateCost(model, promptTokens, completionTokens);

    try {
      const { recordUsage } = await import('../db/usage.js');
      recordUsage({
        threadId: this._threadId,
        model,
        provider,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
        durationMs,
        source: this._source,
      });
    } catch (err) {
      // Best-effort — don't break chat if usage logging fails
      console.error('[usage-tracker] Failed to record usage:', err.message);
    }
  }
}

/**
 * Create a usage tracker callback for LangChain.
 * @param {string} source - 'chat'|'channel'|'summary'
 * @param {string} [threadId]
 * @returns {UsageTracker}
 */
export function createUsageTracker(source, threadId) {
  return new UsageTracker(source, threadId);
}
