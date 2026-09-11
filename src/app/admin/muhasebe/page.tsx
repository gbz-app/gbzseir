import type { Metadata } from "next";
import Form from "next/form";
import { Download, Pencil, Plus, Receipt, TrendingDown, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/shared/empty-state";
import { DemoBadge } from "@/components/shared/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatPrice } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { AdminCard, AdminPagination, EmptyCard, FilterTabs, StatTile } from "@/features/admin/components/admin-ui";
import { ColumnChart, HBarList, monthLabel } from "@/features/admin/components/charts";
import { FinanceCategories } from "@/features/admin/components/finance-categories";
import {
  FinanceDeleteButton,
  FinanceEntryDialog,
  FinanceReceiptButton,
  PAYMENT_LABELS,
  type FinanceCategoryOption,
  type FinanceEntryValue,
} from "@/features/admin/components/finance-entry-dialog";
import { PERIODS, PERIOD_LABELS, periodRange, type Period } from "@/features/admin/lib/finance-period";
import { oneOf, one, pageParam, pageRange } from "@/features/admin/lib/params";

export const metadata: Metadata = { title: "Muhasebe" };

const PAGE_SIZE = 30;
const KINDS = ["tumu", "gelir", "gider"] as const;
type KindFilter = (typeof KINDS)[number];

type Summary = {
  from: string;
  to: string;
  totals: { income: number; expense: number; vat_income: number; vat_expense: number; count: number };
  by_category: Array<{ kind: "income" | "expense"; name: string; color: string; total: number }>;
  monthly: Array<{ month: string; income: number; expense: number }>;
};

type EntryRow = FinanceEntryValue & {
  is_demo: boolean;
  finance_categories: { name: string; color: string } | null;
  businesses: { name: string } | null;
};

const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const tl = (v: number) => formatPrice(Math.round(v * 100) / 100);

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Muhasebe: gelir-gider kayıtları, dönem özeti, aylık grafik, kategori dağılımı, CSV dışa aktarma. */
export default async function AdminFinancePage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const period = oneOf<Period>(sp.donem, PERIODS, "bu-ay");
  const kind = oneOf<KindFilter>(sp.tur, KINDS, "tumu");
  const page = pageParam(sp.sayfa);
  const { from, to } = periodRange(period, { from: one(sp.bas), to: one(sp.bit) });
  const supabase = await createClient();

  let entriesQuery = supabase
    .from("finance_entries")
    .select(
      "id,kind,category_id,amount,vat_rate,occurred_on,description,counterparty,business_id,payment_method,document_url,document_path,is_demo,finance_categories(name,color),businesses(name)",
      { count: "exact" },
    )
    .gte("occurred_on", from)
    .lte("occurred_on", to);
  if (kind !== "tumu") entriesQuery = entriesQuery.eq("kind", kind === "gelir" ? "income" : "expense");
  const { from: rFrom, to: rTo } = pageRange(page, PAGE_SIZE);

  const [summaryRes, entriesRes, catsRes, bizRes] = await Promise.all([
    supabase.rpc("admin_finance_summary", { p_from: from, p_to: to }),
    entriesQuery.order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range(rFrom, rTo),
    supabase.from("finance_categories").select("id,kind,name,color,is_active").order("kind").order("sort"),
    supabase.from("businesses").select("id,name").eq("status", "approved").order("name"),
  ]);
  const s = summaryRes.data as unknown as Summary | null;
  const entries = (entriesRes.data ?? []) as unknown as EntryRow[];
  const categories = (catsRes.data ?? []) as FinanceCategoryOption[];
  const businesses = (bizRes.data ?? []) as Array<{ id: string; name: string }>;
  const baseQuery = { donem: period === "bu-ay" ? undefined : period, bas: period === "ozel" ? from : undefined, bit: period === "ozel" ? to : undefined, tur: kind === "tumu" ? undefined : kind };
  const net = s ? s.totals.income - s.totals.expense : 0;

  const newButton = (
    <FinanceEntryDialog
      categories={categories}
      businesses={businesses}
      trigger={
        <Button>
          <Plus /> Yeni kayıt
        </Button>
      }
    />
  );

  return (
    <>
      <AdminPageHeader
        title="Muhasebe"
        description={`${formatDate(from, { month: "long", year: true })} - ${formatDate(to, { month: "long", year: true })}`}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={withQuery("/admin/muhasebe/csv", { bas: from, bit: to })}>
                <Download /> CSV indir
              </a>
            </Button>
            {newButton}
          </>
        }
      />

      <div className="grid gap-3">
        <FilterTabs
          ariaLabel="Dönem"
          items={PERIODS.filter((p) => p !== "ozel").map((p) => ({ label: PERIOD_LABELS[p], active: p === period, href: routes.admin.finance({ ...baseQuery, donem: p === "bu-ay" ? undefined : p, bas: undefined, bit: undefined, sayfa: undefined }) }))}
        />
        <Form action={routes.admin.finance()} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="donem" value="ozel" />
          {kind !== "tumu" ? <input type="hidden" name="tur" value={kind} /> : null}
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Başlangıç
            <Input type="date" name="bas" defaultValue={from} className="h-10 w-40" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Bitiş
            <Input type="date" name="bit" defaultValue={to} className="h-10 w-40" />
          </label>
          <Button type="submit" variant="outline">
            Uygula
          </Button>
        </Form>
      </div>

      {summaryRes.error || !s ? (
        <div className="mt-5">
          <EmptyCard>
            <EmptyState icon={TriangleAlert} tone="warning" title="Özet yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
          </EmptyCard>
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Gelir" value={tl(s.totals.income)} icon={TrendingUp} tone="success" hint={`KDV ${tl(s.totals.vat_income)}`} />
            <StatTile label="Gider" value={tl(s.totals.expense)} icon={TrendingDown} tone="danger" hint={`KDV ${tl(s.totals.vat_expense)}`} />
            <StatTile label="Net" value={tl(net)} icon={Wallet} tone={net >= 0 ? "success" : "danger"} hint={net >= 0 ? "Kâr" : "Zarar"} />
            <StatTile label="Tahmini KDV farkı" value={tl(s.totals.vat_income - s.totals.vat_expense)} icon={Receipt} hint={`${s.totals.count} kayıt`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <AdminCard title="Aylık gelir ve gider" description="Son 12 ay" className="lg:col-span-2">
              <ColumnChart
                ariaLabel="Aylık gelir ve gider"
                legend={["Gelir", "Gider"]}
                color="bg-emerald-500"
                secondaryColor="bg-rose-400"
                formatValue={(v) => `${compact.format(v)} TL`}
                data={s.monthly.map((m) => ({ label: monthLabel(m.month), value: Number(m.income), secondary: Number(m.expense) }))}
              />
            </AdminCard>
            <AdminCard title="Kategoriye göre">
              <p className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">Gelir</p>
              <HBarList items={s.by_category.filter((c) => c.kind === "income").map((c) => ({ label: c.name, value: Number(c.total), color: c.color }))} formatValue={tl} empty="Bu dönemde gelir yok." />
              <p className="mt-5 mb-2 text-sm font-semibold text-rose-700 dark:text-rose-400">Gider</p>
              <HBarList items={s.by_category.filter((c) => c.kind === "expense").map((c) => ({ label: c.name, value: Number(c.total), color: c.color }))} formatValue={tl} empty="Bu dönemde gider yok." />
            </AdminCard>
          </div>

          <AdminCard
            title="Kayıtlar"
            actions={
              <FilterTabs
                ariaLabel="Tür"
                className="mx-0 px-0"
                items={KINDS.map((k) => ({ label: k === "tumu" ? "Tümü" : k === "gelir" ? "Gelir" : "Gider", active: k === kind, href: routes.admin.finance({ ...baseQuery, tur: k === "tumu" ? undefined : k, sayfa: undefined }) }))}
              />
            }
          >
            {entries.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">Bu dönemde kayıt yok.</p>
                {newButton}
              </div>
            ) : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 font-medium">Tarih</th>
                      <th className="px-2 py-2 font-medium">Kategori</th>
                      <th className="px-2 py-2 font-medium">Açıklama</th>
                      <th className="px-2 py-2 font-medium">Ödeme</th>
                      <th className="px-2 py-2 text-right font-medium">Tutar</th>
                      <th className="px-4 py-2 text-right font-medium">
                        <span className="sr-only">İşlemler</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(e.occurred_on)}</td>
                        <td className="px-2 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full" style={{ backgroundColor: e.finance_categories?.color ?? "#94a3b8" }} aria-hidden />
                            {e.finance_categories?.name ?? "Kategorisiz"}
                          </span>
                        </td>
                        <td className="max-w-[18rem] px-2 py-2.5">
                          <span className="line-clamp-1">{e.description ?? "-"}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[e.counterparty, e.businesses?.name].filter(Boolean).join(" · ")}
                            {e.document_url && !e.document_path ? (
                              <a href={e.document_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary hover:underline">
                                belge
                              </a>
                            ) : null}
                          </span>
                          {e.is_demo ? <DemoBadge /> : null}
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">{PAYMENT_LABELS[e.payment_method]}</td>
                        <td className={cn("px-2 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums", e.kind === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
                          {e.kind === "income" ? "+" : "-"}
                          {tl(Number(e.amount))}
                          {Number(e.vat_rate) ? <Badge variant="outline" className="ml-1.5 h-5 px-1.5 text-[10px]">%{Number(e.vat_rate)}</Badge> : null}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {/* Receipts are private: opened through a 2-minute signed URL. */}
                          {e.document_path ? <FinanceReceiptButton id={e.id} /> : null}
                          <FinanceEntryDialog
                            categories={categories}
                            businesses={businesses}
                            entry={{ ...e, amount: Number(e.amount), vat_rate: Number(e.vat_rate) }}
                            trigger={
                              <Button variant="ghost" size="icon" aria-label="Kaydı düzenle">
                                <Pencil />
                              </Button>
                            }
                          />
                          <FinanceDeleteButton id={e.id} label={`${formatDate(e.occurred_on)} tarihli ${tl(Number(e.amount))} tutarındaki kayıt`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <AdminPagination path={routes.admin.finance()} query={baseQuery} page={page} pageSize={PAGE_SIZE} total={entriesRes.count ?? 0} />
          </AdminCard>

          <AdminCard title="Kategoriler" description="Ad ve renk değişikliği eski kayıtlara da yansır. Kullanılan kategori silinemez; gizlenen kategori yeni kayıtlarda görünmez, eski kayıtlarda kalır.">
            <FinanceCategories categories={categories} />
          </AdminCard>
        </div>
      )}
    </>
  );
}
