import type { Metadata } from "next";
import Link from "next/link";
import { FolderTree, Scale, ShieldAlert, Tags, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/core/format";
import { routes } from "@/core/routes";
import { DEFAULT_SETTINGS, displayTrPhone, supportContact } from "@/lib/app-settings";
import { AdminCard } from "@/features/admin/components/admin-ui";
import { SettingsForm } from "@/features/admin/components/settings-form";
import { legalAdminPath } from "@/features/legal/meta";

export const metadata: Metadata = { title: "Ayarlar" };

/** Genel uygulama ayarları + kategori ve muhasebe ayarlarına kısayollar. Read with the admin session (fresh). */
export default async function AdminSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key,value,updated_at");
  const m = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
  const lastUpdate = (data ?? []).reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);
  const n = (k: string, d: number) => (typeof m.get(k) === "number" ? (m.get(k) as number) : d);
  const s = (k: string, d: string) => (typeof m.get(k) === "string" ? (m.get(k) as string) : d);
  // A jsonb string array as one entry per line (textarea).
  const lines = (k: string) => {
    const v = m.get(k);
    return (Array.isArray(v) ? v : []).filter((t): t is string => typeof t === "string").join("\n");
  };
  // Placeholder contacts show as empty (unset).
  const phone = supportContact(m.get("support_phone"));
  const duty = s("duty_data_mode", DEFAULT_SETTINGS.dutyDataMode);

  return (
    <>
      <AdminPageHeader title="Ayarlar" description={lastUpdate ? `Son değişiklik ${formatRelativeTime(lastUpdate)}` : "Uygulama genelindeki ayarlar"} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <SettingsForm
          initial={{
            businessApplications: m.get("feature_business_applications") === true,
            businessMaxPerOwner: n("business_max_per_owner", 1),
            maintenanceBanner: s("maintenance_banner", ""),
            supportPhone: phone.startsWith("+90") ? displayTrPhone(phone) : phone,
            supportEmail: supportContact(m.get("support_email")),
            listingDays: n("listing_days", DEFAULT_SETTINGS.listingDays),
            firstListingsModerated: n("first_listings_moderated", DEFAULT_SETTINGS.firstListingsModerated),
            listingDailyCap: n("listing_daily_cap", DEFAULT_SETTINGS.listingDailyCap),
            listingActiveCap: n("listing_active_cap", DEFAULT_SETTINGS.listingActiveCap),
            maxProvidersDefault: n("max_providers_default", DEFAULT_SETTINGS.maxProvidersDefault),
            requestRedispatchHours: n("request_redispatch_hours", DEFAULT_SETTINGS.requestRedispatchHours),
            analyticsRetentionDays: n("analytics_retention_days", DEFAULT_SETTINGS.analyticsRetentionDays),
            auditRetentionDays: n("audit_retention_days", DEFAULT_SETTINGS.auditRetentionDays),
            dutyDataMode: duty === "off" || duty === "live" ? duty : "demo",
            popularSearches: lines("popular_searches"),
            popularSearchesHidden: lines("popular_searches_hidden"),
          }}
        />
        <div className="grid content-start gap-4">
          <AdminCard title="Kategoriler">
            <ul className="grid gap-2 text-sm">
              <li>
                <Link href={routes.admin.listingCategories()} className="flex items-center gap-2 text-primary hover:underline">
                  <Tags className="size-4" aria-hidden /> İlan kategorileri ve filtreleri
                </Link>
              </li>
              <li>
                <Link href={routes.admin.serviceCategories()} className="flex items-center gap-2 text-primary hover:underline">
                  <FolderTree className="size-4" aria-hidden /> Hizmet kategorileri ve soru akışları
                </Link>
              </li>
              <li>
                <Link href={routes.admin.finance()} className="flex items-center gap-2 text-primary hover:underline">
                  <Wallet className="size-4" aria-hidden /> Muhasebe kategorileri
                </Link>
              </li>
            </ul>
          </AdminCard>
          <AdminCard title="Yasal metinler">
            <Link href={legalAdminPath()} className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Scale className="size-4" aria-hidden /> KVKK, açık rıza, koşullar ve politikalar
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">Sürümlü metinler; yayınlanan sürüm değişmez.</p>
          </AdminCard>
          <AdminCard title="Sistem (salt okunur)">
            <div className="grid gap-3 text-sm">
              <div>
                <p className="font-semibold">Demo doğrulama kodu</p>
                <Badge variant={m.get("otp_demo_mode") === true ? "warning" : "success"} className="mt-1">
                  {m.get("otp_demo_mode") === true ? "Açık (deneme)" : "Kapalı"}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">Canlıya geçmeden gerçek SMS sağlayıcısı bağlanıp kapatılmalı.</p>
              </div>
              <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Bu ayar güvenlikle ilgili olduğu için yalnızca geliştirici tarafından değiştirilir.
              </p>
            </div>
          </AdminCard>
        </div>
      </div>
    </>
  );
}
