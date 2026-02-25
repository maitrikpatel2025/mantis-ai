'use strict';

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';

// Pricing per 1M tokens (input/output) in USD
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number | null {
  const pricing = PRICING[model];
  if (!pricing) return null;
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  // Return microdollars (x1e6)
  return Math.round((inputCost + outputCost) * 1_000_000);
}

interface LLMStartInfo {
  startTime: number;
  model: string;
}

/**
 * LangChain callback handler that tracks LLM token usage and cost.
 */
class UsageTracker extends BaseCallbackHandler {
  name = 'UsageTracker';

  private _source: string;
  private _threadId: string | undefined;
  private _starts: Map<string, LLMStartInfo>;

  constructor(source: string, threadId?: string) {
    super();
    this._source = source;
    this._threadId = threadId;
    this._starts = new Map();
  }

  async handleLLMStart(llm: Serialized, _prompts: string[], runId: string): Promise<void> {
    const llmAny = llm as unknown as Record<string, unknown>;
    const idArr = llmAny?.id as string[] | undefined;
    this._starts.set(runId, {
      startTime: Date.now(),
      model: idArr?.[2] || (llmAny?.model as string) || 'unknown',
    });
  }

  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const start = this._starts.get(runId);
    if (!start) return;
    this._starts.delete(runId);

    const durationMs = start.startTime ? Date.now() - start.startTime : 0;
    const llmOutput = output?.llmOutput as Record<string, Record<string, number>> | undefined;
    const usage: Record<string, number> = llmOutput?.tokenUsage || llmOutput?.usage || {};

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
        costUsd: costUsd ?? undefined,
        durationMs,
        source: this._source,
      });
    } catch (err: unknown) {
      // Best-effort — don't break chat if usage logging fails
      console.error('[usage-tracker] Failed to record usage:', (err as Error).message);
    }
  }
}

/**
 * Create a usage tracker callback for LangChain.
 */
export function createUsageTracker(source: string, threadId?: string): UsageTracker {
  return new UsageTracker(source, threadId);
}
