import type { Metadata } from "next";
import { Ban, Pencil, Plus, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/core/format";
import { routes } from "@/core/routes";
import { CategoryIcon } from "@/features/listings/components/category-icon";
import { parseAttributeSchema } from "@/features/listings/types";
import { AdminCard, EmptyCard, FilterTabs } from "@/features/admin/components/admin-ui";
import { ListingCategoryEditor, type ListingCategoryValue } from "@/features/admin/components/listing-category-editor";
import { oneOf } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "İlan kategorileri" };

const TYPES = ["classified", "job"] as const;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** İlan kategorileri ağacı, yasaklı kategoriler ve kategori bazlı özellik / filtre alanları. */
export default async function AdminListingCategoriesPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const type = oneOf(sp.tur, TYPES, "classified");
  const supabase = await createClient();
  const [{ data, error }, counts] = await Promise.all([
    supabase.from("listing_categories").select("id,type,parent_id,name,slug,icon,sort,is_banned,attributes_schema").eq("type", type).order("sort").order("name"),
    supabase.from("listings").select("category_id").neq("status", "deleted").limit(10000),
  ]);
  const cats: ListingCategoryValue[] = (data ?? []).map((c) => ({
    id: c.id,
    type: c.type === "job" ? "job" : "classified",
    parent_id: c.parent_id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    sort: c.sort,
    is_banned: c.is_banned,
    attributes_schema: parseAttributeSchema(c.attributes_schema).map((f) => ({ ...f, required: f.required || undefined })),
  }));
  const listingCount = new Map<string, number>();
  for (const l of counts.data ?? []) listingCount.set(l.category_id, (listingCount.get(l.category_id) ?? 0) + 1);
  const roots = cats.filter((c) => !c.parent_id);
  const rootOptions = roots.map((r) => ({ id: r.id, name: r.name }));
  const childrenOf = (id: string) => cats.filter((c) => c.parent_id === id);
  const total = (c: ListingCategoryValue) => (listingCount.get(c.id) ?? 0) + childrenOf(c.id).reduce((n, ch) => n + (listingCount.get(ch.id) ?? 0), 0);

  const chips = (c: ListingCategoryValue) => (
    <span className="flex flex-wrap items-center gap-1.5">
      {c.is_banned ? (
        <Badge variant="destructive" className="gap-1">
          <Ban className="size-3" aria-hidden /> Yasaklı
        </Badge>
      ) : null}
      {c.attributes_schema.length ? (
        <Badge variant="secondary" className="gap-1">
          <SlidersHorizontal className="size-3" aria-hidden /> {c.attributes_schema.length} alan
        </Badge>
      ) : null}
    </span>
  );

  return (
    <>
      <AdminPageHeader
        title="İlan kategorileri"
        description="Kategori ekle, sırala, yasakla ve her kategori için ilan verirken sorulan / listede filtrelenen özellik alanlarını düzenle."
        actions={
          <ListingCategoryEditor
            type={type}
            roots={rootOptions}
            trigger={
              <Button>
                <Plus /> Ana kategori
              </Button>
            }
          />
        }
      />
      <FilterTabs
        ariaLabel="Kategori türü"
        items={TYPES.map((t) => ({ label: t === "classified" ? "İkinci el" : "İş ilanı", active: t === type, href: `${routes.admin.listingCategories()}${t === "classified" ? "" : "?tur=job"}` }))}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Kategoriler yüklenemedi" />
          </EmptyCard>
        ) : (
          roots.map((r) => {
            const kids = childrenOf(r.id);
            return (
              <AdminCard
                key={r.id}
                title={
                  <span className="flex items-center gap-2">
                    <CategoryIcon iconName={r.icon} className="size-5 text-primary" fallback={type === "job" ? "briefcase" : "tag"} />
                    {r.name}
                  </span>
                }
                description={`/${r.slug} · sıra ${r.sort} · ${formatNumber(total(r))} ilan`}
                actions={
                  <>
                    <ListingCategoryEditor
                      type={type}
                      roots={rootOptions}
                      category={r}
                      trigger={
                        <Button variant="outline" size="sm">
                          <Pencil /> Düzenle
                        </Button>
                      }
                    />
                    <ListingCategoryEditor
                      type={type}
                      roots={rootOptions}
                      defaultParentId={r.id}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Plus /> Alt
                        </Button>
                      }
                    />
                  </>
                }
              >
                <div className="mb-2">{chips(r)}</div>
                {kids.length ? (
                  <ul className="divide-y">
                    {kids.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-2">
                        <CategoryIcon iconName={c.icon} className="size-4 shrink-0 text-muted-foreground" fallback={type === "job" ? "briefcase" : "tag"} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            /{c.slug} · {formatNumber(listingCount.get(c.id) ?? 0)} ilan
                          </span>
                        </span>
                        {chips(c)}
                        <ListingCategoryEditor
                          type={type}
                          roots={rootOptions}
                          category={c}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`${c.name} düzenle`}>
                              <Pencil />
                            </Button>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Alt kategori yok.</p>
                )}
              </AdminCard>
            );
          })
        )}
      </div>
    </>
  );
}
