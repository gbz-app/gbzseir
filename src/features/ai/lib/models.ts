/**
 * GebzemAI providers and models (pure TS, safe on the client and the server: no keys here).
 * Keep AI_MODEL_IDS equal to private.ai_model_provider() and public.admin_set_ai_settings() in
 * supabase/migrations/2026091378_gebzemai_openai.sql.
 * Prices: USD per million tokens, Standard tier. OpenAI: developers.openai.com/api/docs/pricing and the model pages;
 * Anthropic: platform.claude.com models overview. Both checked 2026-09-11.
 */

export const AI_PROVIDER_IDS = ["openai", "anthropic"] as const;
export type AiProvider = (typeof AI_PROVIDER_IDS)[number];

export const AI_MODEL_IDS = ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-4.1-mini", "gpt-5.4", "claude-haiku-4-5", "claude-sonnet-5"] as const;
export type AiModelId = (typeof AI_MODEL_IDS)[number];

export type AiModelInfo = {
  id: AiModelId;
  provider: AiProvider;
  /** Short name (admin, usage). */
  label: string;
  /** Admin select text. */
  hint: string;
  /** USD per million uncached input / output tokens. */
  inputPrice: number;
  outputPrice: number;
  /** USD per million cached input tokens read / written (OpenAI has no write premium and never reports writes). */
  cacheReadPrice: number;
  cacheWritePrice: number;
  /** Extra request fields for this model. */
  extra: Record<string, unknown>;
};

export const AI_MODELS: Record<AiModelId, AiModelInfo> = {
  // OpenAI. GPT-5.4 models reason by default only when asked: reasoning_effort "none" (their default) keeps short city
  // answers fast and leaves the whole 800-token cap for the answer. gpt-4.1-mini rejects reasoning_effort (not sent).
  // gpt-5.4 above 272K input tokens costs more; GebzemAI turns stay far below (history is capped at 12,000 characters).
  "gpt-5.4-mini": {
    id: "gpt-5.4-mini",
    provider: "openai",
    label: "GPT-5.4 mini",
    hint: "GPT-5.4 mini (önerilen, hızlı ve ekonomik)",
    inputPrice: 0.75,
    outputPrice: 4.5,
    cacheReadPrice: 0.075,
    cacheWritePrice: 0.75,
    extra: { reasoning_effort: "none" },
  },
  "gpt-5.4-nano": {
    id: "gpt-5.4-nano",
    provider: "openai",
    label: "GPT-5.4 nano",
    hint: "GPT-5.4 nano (en ucuz, daha basit yanıtlar)",
    inputPrice: 0.2,
    outputPrice: 1.25,
    cacheReadPrice: 0.02,
    cacheWritePrice: 0.2,
    extra: { reasoning_effort: "none" },
  },
  "gpt-4.1-mini": {
    id: "gpt-4.1-mini",
    provider: "openai",
    label: "GPT-4.1 mini",
    hint: "GPT-4.1 mini (eski nesil, ucuz)",
    inputPrice: 0.4,
    outputPrice: 1.6,
    cacheReadPrice: 0.1,
    cacheWritePrice: 0.4,
    extra: {},
  },
  "gpt-5.4": {
    id: "gpt-5.4",
    provider: "openai",
    label: "GPT-5.4",
    hint: "GPT-5.4 (daha güçlü, yaklaşık 3 kat maliyet)",
    inputPrice: 2.5,
    outputPrice: 15,
    cacheReadPrice: 0.25,
    cacheWritePrice: 2.5,
    extra: { reasoning_effort: "none" },
  },
  // Anthropic. Haiku: no extended thinking (not sent). Sonnet 5 thinks adaptively by default; short answers do not need it.
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    hint: "Claude Haiku 4.5 (önerilen, en ekonomik)",
    inputPrice: 1,
    outputPrice: 5,
    cacheReadPrice: 0.1,
    cacheWritePrice: 1.25,
    extra: {},
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    hint: "Claude Sonnet 5 (daha güçlü, yaklaşık 2 kat maliyet)",
    inputPrice: 2,
    outputPrice: 10,
    cacheReadPrice: 0.2,
    cacheWritePrice: 2.5,
    extra: { thinking: { type: "disabled" } },
  },
};

export type AiProviderInfo = {
  label: string;
  /** Environment variable holding the key (public Vercel project only). */
  keyEnv: "OPENAI_API_KEY" | "ANTHROPIC_API_KEY";
  defaultModel: AiModelId;
  /** Line under the composer. */
  privacy: string;
  /** Admin help under the model select. */
  modelHelp: string;
};

export const AI_PROVIDERS: Record<AiProvider, AiProviderInfo> = {
  openai: {
    label: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-5.4-mini",
    privacy: "Mesajların yanıt üretmek için OpenAI'ye (ABD) gönderilir ve saklanmaz.",
    modelHelp: "OpenAI modelleri. GPT-5.4 mini hızlı ve ekonomiktir; çoğu soru için yeterlidir.",
  },
  anthropic: {
    label: "Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5",
    privacy: "Mesajların yanıt üretmek için Anthropic'e (ABD) gönderilir ve saklanmaz.",
    modelHelp: "Anthropic (Claude) modelleri. Haiku 4.5 en erken 15 Ekim 2026'da kullanımdan kalkabilir; o zaman Sonnet 5'e geç.",
  },
};

const own = (o: object, k: unknown): k is string => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);

export function isAiProvider(v: unknown): v is AiProvider {
  return own(AI_PROVIDERS, v);
}

export function isAiModelId(v: unknown): v is AiModelId {
  return own(AI_MODELS, v);
}

export function modelsOf(provider: AiProvider): AiModelInfo[] {
  return AI_MODEL_IDS.map((id) => AI_MODELS[id]).filter((m) => m.provider === provider);
}

/** The model to use for a provider: the stored one when it belongs to that provider, else the provider's default. */
export function resolveModelId(v: unknown, provider: AiProvider): AiModelId {
  return isAiModelId(v) && AI_MODELS[v].provider === provider ? v : AI_PROVIDERS[provider].defaultModel;
}
