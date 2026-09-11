/**
 * Server side of the GebzemAI models: the shared catalog (../lib/models.ts, also used by the admin form) plus usage and
 * cost. Keep the model list equal to the SQL allowlist in supabase/migrations/2026091378_gebzemai_openai.sql.
 */
import { AI_MODELS, AI_PROVIDERS, isAiModelId, resolveModelId, type AiModelId, type AiModelInfo, type AiProvider } from "../lib/models";

export { AI_MODELS, AI_PROVIDERS, isAiModelId, resolveModelId };
export type { AiModelId, AiProvider };

export type AiModelConfig = AiModelInfo;

/** Default when nothing says which provider (OpenAI's default model). */
export const DEFAULT_AI_MODEL: AiModelId = AI_PROVIDERS.openai.defaultModel;

/** Model config for a stored id; with a provider, a model of another provider falls back to that provider's default. */
export function resolveAiModel(v: unknown, provider?: AiProvider): AiModelConfig {
  return AI_MODELS[provider ? resolveModelId(v, provider) : isAiModelId(v) ? v : DEFAULT_AI_MODEL];
}

export type AiUsageTotals = {
  /** Uncached input tokens. */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  toolCalls: number;
};

export function emptyUsage(): AiUsageTotals {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, toolCalls: 0 };
}

/** All input tokens (for the usage record). */
export function totalInputTokens(u: AiUsageTotals): number {
  return u.input + u.cacheWrite + u.cacheRead;
}

/**
 * Cost in micro-USD (1 USD = 1,000,000). Tokens x USD-per-MTok is exactly micro-USD. Cached input uses the model's
 * cache prices (Anthropic: writes 1.25x, reads 0.1x; OpenAI: reads 0.1x or 0.25x, no write premium). Rounded up.
 */
export function costMicroUsd(u: AiUsageTotals, model: AiModelConfig): number {
  const micro = u.input * model.inputPrice + u.cacheWrite * model.cacheWritePrice + u.cacheRead * model.cacheReadPrice + u.output * model.outputPrice;
  // The small epsilon keeps float noise (0.75 x n) from rounding a whole number up.
  return Math.max(0, Math.ceil(micro - 1e-6));
}
