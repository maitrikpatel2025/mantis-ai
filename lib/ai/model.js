import { ChatAnthropic } from "@langchain/anthropic";
const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.5-pro"
};
function parseModelSpec(spec) {
  if (!spec || typeof spec !== "string") return { provider: null, modelName: null };
  const idx = spec.indexOf("/");
  if (idx === -1) return { provider: null, modelName: spec };
  return { provider: spec.slice(0, idx), modelName: spec.slice(idx + 1) };
}
async function createModel(options = {}) {
  const parsed = options.model ? parseModelSpec(options.model) : { provider: null, modelName: null };
  const provider = parsed.provider || process.env.LLM_PROVIDER || "anthropic";
  const modelName = parsed.modelName || process.env.LLM_MODEL || DEFAULT_MODELS[provider] || DEFAULT_MODELS.anthropic;
  const maxTokens = options.maxTokens || Number(process.env.LLM_MAX_TOKENS) || 4096;
  switch (provider) {
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY environment variable is required");
      }
      return new ChatAnthropic({
        modelName,
        maxTokens,
        anthropicApiKey: apiKey
      });
    }
    case "custom":
    case "openai": {
      const { ChatOpenAI } = await import("@langchain/openai");
      const apiKey = provider === "custom" ? process.env.CUSTOM_API_KEY || "not-needed" : process.env.OPENAI_API_KEY;
      const baseURL = process.env.OPENAI_BASE_URL;
      if (!apiKey && !baseURL) {
        throw new Error("OPENAI_API_KEY environment variable is required (or set OPENAI_BASE_URL for local models)");
      }
      const config = { modelName, maxTokens };
      config.apiKey = apiKey || "not-needed";
      if (baseURL) {
        config.configuration = { baseURL };
      }
      return new ChatOpenAI(config);
    }
    case "google": {
      const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("GOOGLE_API_KEY environment variable is required");
      }
      return new ChatGoogleGenerativeAI({
        model: modelName,
        maxOutputTokens: maxTokens,
        apiKey
      });
    }
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
async function createModelWithFallback(options = {}) {
  const primary = await createModel(options);
  const fallbackSpecs = options.fallbacks || (process.env.LLM_FALLBACKS ? process.env.LLM_FALLBACKS.split(",").map((s) => s.trim()).filter(Boolean) : []);
  if (fallbackSpecs.length === 0) return primary;
  const fallbacks = [];
  for (const spec of fallbackSpecs) {
    try {
      const model = await createModel({ ...options, model: spec });
      fallbacks.push(model);
    } catch (err) {
      console.warn(`[model] Failed to create fallback model "${spec}":`, err.message);
    }
  }
  if (fallbacks.length === 0) return primary;
  return primary.withFallbacks({ fallbacks });
}
export {
  createModel,
  createModelWithFallback,
  parseModelSpec
};
