"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { dbFail, withAdmin } from "@/features/admin/server/guard";
import { fail, ok, type ActionResult } from "@/features/admin/lib/action-result";
import { firstIssue } from "@/features/admin/lib/zod";
import { AI_MODEL_IDS, AI_MODELS, AI_PROVIDER_IDS } from "../lib/models";
import { callRpc } from "../server/rpc";

const int = (min: number, max: number, label: string) =>
  z.coerce.number().int(`${label} tam sayı olmalı.`).min(min, `${label} en az ${min} olmalı.`).max(max, `${label} en fazla ${max} olabilir.`);

const schema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(AI_PROVIDER_IDS, { message: "Bir sağlayıcı seç." }),
    model: z.enum(AI_MODEL_IDS, { message: "Bir model seç." }),
    dailyMessages: int(1, 500, "Günlük soru sınırı"),
    perMinute: int(1, 60, "Dakikalık soru sınırı"),
    dailyBudgetUsd: z.coerce.number("Günlük bütçe sayı olmalı.").min(0, "Günlük bütçe en az 0 olmalı.").max(1000, "Günlük bütçe en fazla 1000 dolar olabilir."),
  })
  .refine((v) => AI_MODELS[v.model].provider === v.provider, { message: "Bu model seçilen sağlayıcıda yok.", path: ["model"] });

export type AiSettingsInput = z.input<typeof schema>;

/**
 * Saves the GebzemAI settings through admin_set_ai_settings (admin session; the admin site has no service key).
 * The public page and route read these keys fresh, so nothing on the public app needs revalidating.
 */
export async function saveAiSettingsAction(input: AiSettingsInput): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const { error } = await callRpc(supabase, "admin_set_ai_settings", {
      p_enabled: v.enabled,
      p_provider: v.provider,
      p_model: v.model,
      p_daily_messages: v.dailyMessages,
      p_per_minute: v.perMinute,
      p_daily_budget_usd: Math.round(v.dailyBudgetUsd * 100) / 100,
    });
    if (error) return dbFail(error);
    revalidatePath(routes.admin.gebzemai());
    return ok(null, "GebzemAI ayarları kaydedildi.");
  });
}
