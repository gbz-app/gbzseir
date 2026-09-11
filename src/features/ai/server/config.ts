import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { AI_PROVIDERS, isAiProvider, resolveModelId, type AiModelId, type AiProvider } from "../lib/models";

/** app_settings keys written by admin_set_ai_settings (2026091375_gebzemai.sql, 2026091378_gebzemai_openai.sql). */
export const AI_SETTING_KEYS = ["ai_enabled", "ai_provider", "ai_model", "ai_daily_messages", "ai_per_minute", "ai_daily_budget_usd"] as const;

export type AiConfig = {
  /** app_settings ai_provider; when unset or invalid: OpenAI if OPENAI_API_KEY is set, else Anthropic. */
  provider: AiProvider;
  /** The selected provider's key is set on this deployment (the public Vercel project only). */
  keyPresent: boolean;
  enabled: boolean;
  /** ai_model when it belongs to the provider, else the provider's default. */
  model: AiModelId;
  dailyMessages: number;
  perMinute: number;
  budgetUsd: number;
};

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** The provider's API key on this deployment. Server only: never logged, returned or sent anywhere but that provider. */
export function providerApiKey(provider: AiProvider): string | undefined {
  const raw = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  return raw?.trim() || undefined;
}

/** Provider when app_settings does not name one: the one whose key is set (OpenAI first). */
export function defaultAiProvider(): AiProvider {
  return providerApiKey("openai") ? "openai" : "anthropic";
}

export function resolveAiProvider(v: unknown): AiProvider {
  return isAiProvider(v) ? v : defaultAiProvider();
}

function fallbackConfig(): AiConfig {
  const provider = defaultAiProvider();
  return {
    provider,
    keyPresent: Boolean(providerApiKey(provider)),
    enabled: false,
    model: AI_PROVIDERS[provider].defaultModel,
    dailyMessages: 20,
    perMinute: 5,
    budgetUsd: 5,
  };
}

/** Fresh read (no cache): the page and the route must follow the admin switch at once. Never throws. */
export async function getAiConfig(): Promise<AiConfig> {
  try {
    const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) },
    });
    const { data, error } = await client.from("app_settings").select("key,value").in("key", [...AI_SETTING_KEYS]);
    if (error || !data) return fallbackConfig();
    const m = new Map(data.map((r) => [r.key, r.value as unknown]));
    const d = fallbackConfig();
    const provider = resolveAiProvider(m.get("ai_provider"));
    return {
      provider,
      keyPresent: Boolean(providerApiKey(provider)),
      enabled: m.get("ai_enabled") === true,
      model: resolveModelId(m.get("ai_model"), provider),
      dailyMessages: num(m.get("ai_daily_messages"), d.dailyMessages),
      perMinute: num(m.get("ai_per_minute"), d.perMinute),
      budgetUsd: num(m.get("ai_daily_budget_usd"), d.budgetUsd),
    };
  } catch {
    return fallbackConfig();
  }
}

/** On only when switched on and the selected provider's key is set. */
export function isAiAvailable(c: AiConfig): boolean {
  return c.keyPresent && c.enabled;
}
