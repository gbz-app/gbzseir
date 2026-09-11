import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPinCheck, MapPinned, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/core/format";
import { routes } from "@/core/routes";
import { GUIDE_KIND_META, GUIDE_LIST_KINDS } from "@/features/guide/lib/constants";
import { EmptyCard, FilterTabs } from "@/features/admin/components/admin-ui";
import { GuideRowList } from "@/features/admin/components/guide-list";
import { guideKindFromParam, guideKindParam } from "@/features/admin/lib/guide-admin";
import { one } from "@/features/admin/lib/params";
import { GUIDE_ROW_COLUMNS, loadGuideVocab, toGuideRowItem } from "@/features/admin/server/guide-data";

export const metadata: Metadata = { title: "Konumu eksik kayıtlar" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * "Konumu eksik" queue: visible guide records without a map pin. Each row opens the editor with the map already open;
 * "Kaydet ve sıradaki" there moves on to the next one (same order as this list).
 */
export default async function AdminGuideMissingPinsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = guideKindFromParam(one(sp.tur));
  const kindParam = kind ? guideKindParam(kind) : undefined;
  const supabase = await createClient();
  const [{ data, error }, vocab] = await Promise.all([
    supabase
      .from("poi")
      .select(GUIDE_ROW_COLUMNS)
      .in("kind", [...GUIDE_LIST_KINDS])
      .is("lat", null)
      .eq("hidden", false)
      .order("kind")
      .order("search_norm")
      .order("id")
      .limit(2000),
    loadGuideVocab(supabase),
  ]);
  const all = (data ?? []).map((r) => toGuideRowItem(r, vocab));
  const rows = kind ? all.filter((r) => r.kind === kind) : all;
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const pinQuery = { tur: kindParam, sira: "konumsuz" };

  return (
    <>
      <AdminPageHeader
        title="Konumu eksik"
        description={`Haritada iğnesi olmayan ${formatNumber(all.length)} kayıt. Birini açınca harita hemen açılır; adresi arayıp iğneyi koy, "Kaydet ve sıradaki" ile devam et.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={routes.admin.guide()}>
                <ArrowLeft aria-hidden /> Şehir rehberi
              </Link>
            </Button>
            {rows.length ? (
              <Button asChild>
                <Link href={routes.admin.guideItem(rows[0].id, { ...pinQuery, konum: 1 })}>
                  <MapPinned aria-hidden /> İşaretlemeye başla
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <FilterTabs
        ariaLabel="Kayıt türü"
        items={[
          { label: "Tümü", count: all.length, active: !kind, href: routes.admin.guideMissingPins() },
          ...GUIDE_LIST_KINDS.filter((k) => counts.has(k) || k === kind).map((k) => ({
            label: GUIDE_KIND_META[k].plural,
            count: counts.get(k) ?? 0,
            active: k === kind,
            href: routes.admin.guideMissingPins({ tur: guideKindParam(k) }),
          })),
        ]}
      />
      <div className="mt-5">
        {error ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Kayıtlar yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={MapPinCheck} title="Konumu eksik kayıt kalmadı" />
          </EmptyCard>
        ) : (
          <GuideRowList items={rows} pinQuery={pinQuery} />
        )}
      </div>
    </>
  );
}
