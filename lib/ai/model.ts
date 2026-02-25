import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ParsedModelSpec, ModelOptions } from '../types.js';

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.5-pro',
};

/**
 * Parse a model spec like "anthropic/claude-opus-4-6" into { provider, modelName }.
 * If no "/" present, returns { provider: null, modelName: spec }.
 */
export function parseModelSpec(spec: string | undefined | null): ParsedModelSpec {
  if (!spec || typeof spec !== 'string') return { provider: null, modelName: null };
  const idx = spec.indexOf('/');
  if (idx === -1) return { provider: null, modelName: spec };
  return { provider: spec.slice(0, idx), modelName: spec.slice(idx + 1) };
}

/**
 * Create a LangChain chat model based on environment configuration.
 */
export async function createModel(options: ModelOptions = {}): Promise<BaseChatModel> {
  // Parse options.model if provided (e.g. "anthropic/claude-opus-4-6")
  const parsed = options.model ? parseModelSpec(options.model) : { provider: null, modelName: null };

  const provider = parsed.provider || process.env.LLM_PROVIDER || 'anthropic';
  const modelName = parsed.modelName || process.env.LLM_MODEL || DEFAULT_MODELS[provider] || DEFAULT_MODELS.anthropic;
  const maxTokens = options.maxTokens || Number(process.env.LLM_MAX_TOKENS) || 4096;

  switch (provider) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required');
      }
      return new ChatAnthropic({
        modelName,
        maxTokens,
        anthropicApiKey: apiKey,
      });
    }
    case 'custom':
    case 'openai': {
      const { ChatOpenAI } = await import('@langchain/openai');
      const apiKey = provider === 'custom'
        ? (process.env.CUSTOM_API_KEY || 'not-needed')
        : process.env.OPENAI_API_KEY;
      const baseURL = process.env.OPENAI_BASE_URL;
      if (!apiKey && !baseURL) {
        throw new Error('OPENAI_API_KEY environment variable is required (or set OPENAI_BASE_URL for local models)');
      }
      const config: Record<string, unknown> = { modelName, maxTokens };
      config.apiKey = apiKey || 'not-needed';
      if (baseURL) {
        config.configuration = { baseURL };
      }
      return new ChatOpenAI(config);
    }
    case 'google': {
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY environment variable is required');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new ChatGoogleGenerativeAI({
        model: modelName,
        maxOutputTokens: maxTokens,
        apiKey,
      } as any);
    }
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/**
 * Create a model with fallback chain.
 */
export async function createModelWithFallback(options: ModelOptions = {}): Promise<BaseChatModel> {
  const primary = await createModel(options);

  const fallbackSpecs = options.fallbacks
    || (process.env.LLM_FALLBACKS ? process.env.LLM_FALLBACKS.split(',').map(s => s.trim()).filter(Boolean) : []);

  if (fallbackSpecs.length === 0) return primary;

  const fallbacks: BaseChatModel[] = [];
  for (const spec of fallbackSpecs) {
    try {
      const model = await createModel({ ...options, model: spec });
      fallbacks.push(model);
    } catch (err: unknown) {
      console.warn(`[model] Failed to create fallback model "${spec}":`, (err as Error).message);
    }
  }

  if (fallbacks.length === 0) return primary;

  return primary.withFallbacks({ fallbacks }) as unknown as BaseChatModel;
}
