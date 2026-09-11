/**
 * One business per account (2026091370_business_rules.sql): app_settings.business_max_per_owner (default 1) plus the
 * admin-granted profiles.extra_business_slots. Server and client safe.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { routes, withQuery } from "@/core/routes";

export type BusinessQuota = { count: number; limit: number; canAdd: boolean };

export function parseBusinessQuota(data: unknown): BusinessQuota | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { count?: unknown; limit?: unknown; can_add?: unknown };
  if (typeof d.count !== "number" || typeof d.limit !== "number") return null;
  return { count: d.count, limit: d.limit, canAdd: typeof d.can_add === "boolean" ? d.can_add : d.count < d.limit };
}

/** The signed-in user's quota (my_business_quota); null for guests or when it cannot be read (apply_business still checks). */
export async function fetchBusinessQuota(client: SupabaseClient<Database>): Promise<BusinessQuota | null> {
  try {
    const { data, error } = await client.rpc("my_business_quota");
    return error ? null : parseBusinessQuota(data);
  } catch {
    return null;
  }
}

/** ?neden= value of the support centre that preselects "İşletmemi ekletmek istiyorum" for a new business. */
export const NEW_BUSINESS_HELP_REASON = "yeni-isletme";

/** Support centre, "İşletmemi ekletmek istiyorum" topic, message step, pre-filled for a new business. */
export function newBusinessHelpHref(): string {
  return withQuery(routes.content.help("isletme"), { neden: NEW_BUSINESS_HELP_REASON });
}

/** "Bir hesapla bir işletme açabilirsin." / "... en fazla 3 işletme ..." */
export function businessLimitText(limit: number): string {
  return limit <= 1
    ? "Bir hesapla bir işletme açabilirsin. Yeni işletme için destek ekibimize yaz, hesabına ekleyelim."
    : `Bir hesapla en fazla ${limit} işletme açabilirsin. Yeni işletme için destek ekibimize yaz, hesabına ekleyelim.`;
}
