import type { Metadata } from "next";
import { Info, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { getAppSettings } from "@/lib/app-settings";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { EmptyCard } from "@/features/admin/components/admin-ui";
import { CategoryTable, NewCategoryButton, type CategoryRowData } from "@/features/admin/components/category-table";

export const metadata: Metadata = { title: "Hizmet kategorileri" };

export default async function AdminServiceCategoriesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data, error }, settings] = await Promise.all([
    supabase
      .from("service_categories")
      .select(
        "id,parent_id,name,slug,icon,description,synonyms,sort,active,popular,auto_dispatch,max_providers,notify_pool_size,question_flows(version,published)",
      )
      .order("sort", { ascending: true })
      .order("name", { ascending: true }),
    getAppSettings(),
  ]);

  const rows: CategoryRowData[] = (data ?? []).map((c) => {
    const flows = c.question_flows ?? [];
    const published = flows.filter((f) => f.published).sort((a, b) => b.version - a.version)[0];
    return {
      id: c.id,
      parent_id: c.parent_id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      description: c.description,
      synonyms: c.synonyms ?? [],
      sort: c.sort,
      active: c.active,
      popular: c.popular,
      auto_dispatch: c.auto_dispatch,
      max_providers: c.max_providers,
      notify_pool_size: c.notify_pool_size,
      flowVersion: published?.version ?? null,
      flowCount: flows.length,
    };
  });
  const roots = rows.filter((r) => !r.parent_id).map((r) => ({ id: r.id, name: r.name }));

  return (
    <>
      <AdminPageHeader
        title="Hizmet kategorileri"
        description="Kategori ekle, adını ve arama kelimelerini düzenle, aç/kapat, popüler olarak işaretle ve eşleştirme modunu seç. Soru akışını düzenlemek için alt kategorinin akış bağlantısına dokun."
        actions={error ? undefined : <NewCategoryButton roots={roots} />}
      />
      <div className="mb-4 flex gap-3 rounded-2xl bg-info-soft p-4 text-sm text-info">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p>
            <strong>Otomatik:</strong> talep gönderildiği anda uygun firmalara iletilir (bildirim havuzu kadar firma).
          </p>
          <p>
            <strong>Concierge:</strong> talep önce &quot;İnceleme bekliyor&quot; durumuna düşer; Hizmet talepleri ekranında &quot;Eşleştir ve gönder&quot; ile iletilir.
          </p>
          <p>
            <strong>Kabul limiti:</strong> bir talebi en fazla kaç firma kabul edebilir (müşteri telefonu yalnızca kabul eden firmalara açılır). Boşsa
            Ayarlar&apos;daki varsayılan ({settings.maxProvidersDefault}) geçerli.
          </p>
          <p>
            <strong>Silme:</strong> firması, talebi ya da alt kategorisi olan kategori silinmez; onu pasif yap.
          </p>
        </div>
      </div>
      {error ? (
        <EmptyCard>
          <EmptyState icon={TriangleAlert} tone="warning" title="Kategoriler yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
        </EmptyCard>
      ) : rows.length === 0 ? (
        <EmptyCard>
          <EmptyState title="Kategori yok" description="Yeni kategori ile ilk ana kategoriyi ekle." />
        </EmptyCard>
      ) : (
        <CategoryTable categories={rows} defaultMaxProviders={settings.maxProvidersDefault} />
      )}
    </>
  );
}
