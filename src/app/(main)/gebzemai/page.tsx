import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AiProviderScope } from "@/features/ai/components/ai-privacy";
import { GebzemAiScreen, type AiLimitState, type GebzemAiMode } from "@/features/ai/components/gebzemai-screen";
import { getAiConfig, isAiAvailable } from "@/features/ai/server/config";
import { callRpc } from "@/features/ai/server/rpc";

export const metadata: Metadata = {
  title: "GebzemAI",
  description: "Gebze hakkında sor: nöbetçi eczane, açık mekanlar, etkinlikler ve daha fazlası.",
  robots: { index: false },
};

type AiStatus = { ok: boolean; reason?: string | null; reset_at?: string | null; remaining?: number | null };

/**
 * GebzemAI (public app only). Off (the selected provider's key is not set, or app_settings ai_enabled is false): calm
 * "henüz aktif değil" state. Guests: intro + sign-in that returns here. Signed-in users: the chat, with today's limit
 * state. The provider (app_settings ai_provider) also picks the privacy line under the composer (AiProviderScope).
 */
export default async function GebzemAiPage() {
  if (IS_ADMIN_SITE) notFound();
  const [user, config] = await Promise.all([getCurrentUser(), getAiConfig()]);
  const mode: GebzemAiMode = !isAiAvailable(config) ? "inactive" : user ? "chat" : "guest";

  let initialLimit: AiLimitState | null = null;
  let initialRemaining: number | null = null;
  if (mode === "chat") {
    const { data } = await callRpc<AiStatus>(await createClient(), "ai_status");
    if (data) {
      initialRemaining = typeof data.remaining === "number" ? data.remaining : null;
      if (!data.ok && (data.reason === "daily" || data.reason === "minute" || data.reason === "budget")) {
        initialLimit = { reason: data.reason, resetAt: data.reset_at ?? null };
      }
    }
  }

  return (
    <AiProviderScope provider={config.provider}>
      <GebzemAiScreen mode={mode} initialLimit={initialLimit} initialRemaining={initialRemaining} />
    </AiProviderScope>
  );
}
