import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { MapPinOff, Plus, Search, Signpost, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/core/format";
import { routes } from "@/core/routes";
import { trNormalize } from "@/core/tr";
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import { GUIDE_KIND_META, GUIDE_LIST_KINDS } from "@/features/guide/lib/constants";
import { AdminPagination, EmptyCard, FilterTabs } from "@/features/admin/components/admin-ui";
import { GuideRowList } from "@/features/admin/components/guide-list";
import { GuideOptions } from "@/features/admin/components/guide-options";
import {
  GUIDE_CATEGORY_FIELD_LABELS,
  GUIDE_NONE_VALUE,
  GUIDE_STATUS,
  GUIDE_STATUS_LABELS,
  guideCategoryField,
  guideCategoryOptions,
  guideKindFromParam,
  guideKindParam,
  type GuideStatus,
} from "@/features/admin/lib/guide-admin";
import { one, oneOf, pageParam, pageRange, searchTerm } from "@/features/admin/lib/params";
import { GUIDE_ROW_COLUMNS, loadGuideVocab, toGuideRowItem } from "@/features/admin/server/guide-data";

export const metadata: Metadata = { title: "Şehir rehberi" };

const PAGE_SIZE = 50;
const SELECT = "h-11 min-w-0 rounded-md border bg-background px-3 text-sm";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Şehir rehberi: resmî kurumlar, ATM, banka şubeleri, akaryakıt, şarj istasyonları and gezilecek yerler (public.poi).
 * Filters: kind (?tur), status (?durum: doğrulanmış, doğrulanmamış, konumu eksik, gizli), category / bank / brand /
 * operator (?kategori) and search (?q); counts per kind and status.
 */
export default async function AdminGuidePage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = guideKindFromParam(one(sp.tur));
  const kindParam = kind ? guideKindParam(kind) : undefined;
  const status = oneOf<GuideStatus>(sp.durum, GUIDE_STATUS, "tumu");
  const q = searchTerm(sp.q);
  const qNorm = q ? trNormalize(q) : "";
  const rawCategory = one(sp.kategori);
  const category = kind && rawCategory && CATEGORY_KEY_RE.test(rawCategory) ? rawCategory : undefined;
  const page = pageParam(sp.sayfa);
  const kinds = kind ? [kind] : [...GUIDE_LIST_KINDS];
  const supabase = await createClient();

  const counted = () => supabase.from("poi").select("id", { count: "exact", head: true }).in("kind", kinds);
  let query = supabase.from("poi").select(GUIDE_ROW_COLUMNS, { count: "exact" }).in("kind", kinds);
  if (kind && category) {
    const column = `details->>${guideCategoryField(kind)}`;
    query = category === GUIDE_NONE_VALUE ? query.is(column, null) : query.eq(column, category);
  }
  if (status === "dogrulanmis") query = query.not("verified_at", "is", null);
  else if (status === "dogrulanmamis") query = query.is("verified_at", null);
  else if (status === "konumsuz") query = query.is("lat", null);
  else if (status === "gizli") query = query.eq("hidden", true);
  if (qNorm) query = query.ilike("search_norm", `%${qNorm}%`);
  const { from, to } = pageRange(page, PAGE_SIZE);

  const [list, vocab, verifiedCount, missingCount, hiddenCount, missingAll, ...kindCounts] = await Promise.all([
    query.order("search_norm").order("id").range(from, to),
    loadGuideVocab(supabase),
    counted().not("verified_at", "is", null),
    counted().is("lat", null),
    counted().eq("hidden", true),
    supabase.from("poi").select("id", { count: "exact", head: true }).in("kind", [...GUIDE_LIST_KINDS]).is("lat", null).eq("hidden", false),
    ...GUIDE_LIST_KINDS.map((k) => supabase.from("poi").select("id", { count: "exact", head: true }).eq("kind", k)),
  ]);

  const countOf = (k: (typeof GUIDE_LIST_KINDS)[number]) => kindCounts[GUIDE_LIST_KINDS.indexOf(k)]?.count ?? 0;
  const allTotal = GUIDE_LIST_KINDS.reduce((s, k) => s + countOf(k), 0);
  const total = kind ? countOf(kind) : allTotal;
  const verified = verifiedCount.count ?? 0;
  const statusCounts: Record<GuideStatus, number> = {
    tumu: total,
    dogrulanmis: verified,
    dogrulanmamis: Math.max(0, total - verified),
    konumsuz: missingCount.count ?? 0,
    gizli: hiddenCount.count ?? 0,
  };
  // PGRST103: the page starts past the last row.
  const pastEnd = list.error?.code === "PGRST103";
  const failed = !!list.error && !pastEnd;
  const rows = failed || pastEnd ? [] : (list.data ?? []).map((r) => toGuideRowItem(r, vocab));
  const field = kind ? guideCategoryField(kind) : null;
  const categoryOptions = kind ? guideCategoryOptions(kind, vocab, { includeInactive: true, current: category === GUIDE_NONE_VALUE ? null : category }) : [];
  const filtered = !!(category || qNorm || status !== "tumu");

  return (
    <>
      <AdminPageHeader
        title="Şehir rehberi"
        description={`Resmî kurumlar, ATM, banka, akaryakıt, şarj ve gezilecek yerler: ${formatNumber(allTotal)} kayıt. Kaydettiğin kayıt kilitlenir; içe aktarma ve veri eşitlemesi değişikliklerini ezmez.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={routes.admin.guideMissingPins()}>
                <MapPinOff aria-hidden /> Konumu eksik ({formatNumber(missingAll.count ?? 0)})
              </Link>
            </Button>
            <Button asChild>
              <Link href={routes.admin.guideNew({ tur: kindParam })}>
                <Plus aria-hidden /> Yeni kayıt
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3">
        <FilterTabs
          ariaLabel="Kayıt türü"
          items={[
            { label: "Tümü", count: allTotal, active: !kind, href: routes.admin.guide({ durum: status === "tumu" ? undefined : status, q }) },
            ...GUIDE_LIST_KINDS.map((k) => ({
              label: GUIDE_KIND_META[k].plural,
              count: countOf(k),
              active: k === kind,
              href: routes.admin.guide({ tur: guideKindParam(k), durum: status === "tumu" ? undefined : status, q }),
            })),
          ]}
        />
        <FilterTabs
          ariaLabel="Durum"
          items={GUIDE_STATUS.map((s) => ({
            label: GUIDE_STATUS_LABELS[s],
            count: statusCounts[s],
            active: s === status,
            href: routes.admin.guide({ tur: kindParam, durum: s === "tumu" ? undefined : s, kategori: category, q }),
          }))}
        />
        <Form action={routes.admin.guide()} role="search" className="flex w-full max-w-2xl flex-wrap gap-2">
          {kindParam ? <input type="hidden" name="tur" value={kindParam} /> : null}
          {status !== "tumu" ? <input type="hidden" name="durum" value={status} /> : null}
          {kind && field ? (
            <select name="kategori" defaultValue={category ?? ""} aria-label={GUIDE_CATEGORY_FIELD_LABELS[field].label} className={`${SELECT} w-full sm:w-56`}>
              <option value="">{GUIDE_CATEGORY_FIELD_LABELS[field].plural}</option>
              <option value={GUIDE_NONE_VALUE}>{GUIDE_CATEGORY_FIELD_LABELS[field].none}</option>
              <GuideOptions options={categoryOptions} />
            </select>
          ) : null}
          <div className="relative min-w-0 flex-1 basis-48">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" type="search" defaultValue={q} placeholder="Ad, adres ya da kategori" aria-label="Rehberde ara" className="h-11 pl-9" />
          </div>
          <Button type="submit" variant="secondary">
            Filtrele
          </Button>
        </Form>
        {!kind ? <p className="text-xs text-muted-foreground">Kategori, banka ya da markaya göre süzmek için önce bir tür seç.</p> : null}
      </div>
      <div className="mt-5">
        {failed ? (
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Kayıtlar yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        ) : rows.length === 0 ? (
          <EmptyCard>
            <EmptyState icon={Signpost} title={filtered ? "Bu filtrede kayıt yok" : "Henüz kayıt yok"} />
          </EmptyCard>
        ) : (
          <>
            <GuideRowList items={rows} />
            <AdminPagination
              path={routes.admin.guide()}
              query={{ tur: kindParam, durum: status === "tumu" ? undefined : status, kategori: category, q }}
              page={page}
              pageSize={PAGE_SIZE}
              total={list.count ?? 0}
            />
          </>
        )}
      </div>
    </>
  );
}
