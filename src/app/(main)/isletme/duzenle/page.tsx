import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BedDouble, ChevronRight, CircleAlert, CircleCheck, ExternalLink, ImagePlus, QrCode, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes, type BusinessEditStep } from "@/core/routes";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { EDIT_STEP_ICONS, editStepTitle } from "@/features/business/components/edit/steps";
import { MIN_PORTFOLIO_PHOTOS } from "@/features/business/lib/completeness";
import { DAY_KEYS, hasAnyHours, parseWorkingHours, type WorkingHours } from "@/features/business/lib/hours";
import { getOwnerToolCounts } from "@/features/business/lib/owner-progress";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { hasMenu, hasRooms, resolveVertical } from "@/features/business/lib/verticals";

export const metadata: Metadata = { title: "İşletme sayfamı düzenle", robots: { index: false } };

/** Same rule as the firm page's "7/24 açık": every day 00:00 - 23:59. */
function isAlwaysOpen(hours: WorkingHours): boolean {
  return DAY_KEYS.every((k) => hours[k]?.open === "00:00" && hours[k]?.close === "23:59");
}

/** done: true = "Tamam" with a check, false = missing (amber), null = neutral (count unknown). */
type RowStatus = { done: boolean | null; label: string };
type HubRow = { key: string; href: string; icon: LucideIcon; title: string; status: RowStatus };

const ok = (label = "Tamam"): RowStatus => ({ done: true, label });
const missing = (label: string): RowStatus => ({ done: false, label });

function countStatus(count: number | null, unit: string, empty: string): RowStatus {
  if (count === null) return { done: null, label: "Düzenle" };
  return count > 0 ? ok(`${count} ${unit}`) : missing(empty);
}

function Row({ row }: { row: HubRow }) {
  const { done, label } = row.status;
  return (
    <li>
      <Link
        href={row.href}
        className="flex min-h-16 items-center gap-3 rounded-2xl bg-card px-4 py-3 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
          <row.icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{row.title}</span>
          <span
            className={cn(
              "mt-0.5 flex min-w-0 items-center gap-1 text-xs",
              done === false ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground",
            )}
          >
            {done === true ? <CircleCheck className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
            {done === false ? <CircleAlert className="size-3.5 shrink-0" aria-hidden /> : null}
            <span className="truncate">{label}</span>
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function Group({ title, rows }: { title: string; rows: HubRow[] }) {
  if (!rows.length) return null;
  return (
    <section aria-label={title}>
      <h2 className="px-1 pb-2 text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <Row key={r.key} row={r} />
        ))}
      </ul>
    </section>
  );
}

/** H4 - İşletme sayfasını düzenle (hub): one row per section; each opens its own screen and saves on its own. */
export default async function BusinessEditHubPage() {
  await requireProfile(routes.business.edit());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());

  const vertical = resolveVertical(b.vertical, b.kinds);
  const hasScope = b.kinds.includes("service");
  const offersServices = hasScope || vertical === "hizmet";
  const counts = await getOwnerToolCounts(b);
  const hours = parseWorkingHours(b.working_hours);
  const hasPin = b.lat !== null && b.lng !== null;
  const photoCount = b.photos.length;
  const step = (id: BusinessEditStep, status: RowStatus): HubRow => ({
    key: id,
    href: routes.business.editStep(id),
    icon: EDIT_STEP_ICONS[id],
    title: editStepTitle(id, vertical),
    status,
  });

  const noLogo = !b.logo_url;
  const noAbout = !b.description?.trim();
  const pageRows: HubRow[] = [
    step("temel", noLogo && noAbout ? missing("Logo ve açıklama eksik") : noLogo ? missing("Logo eksik") : noAbout ? missing("Açıklama eksik") : ok()),
    step("iletisim", b.phone ? ok() : missing("Telefon eksik")),
    step(
      "konum",
      b.address?.trim() && hasPin ? ok(b.neighbourhood_name ? `${b.neighbourhood_name} Mah.` : "Tamam") : missing(hasPin ? "Adres eksik" : "Harita konumu eksik"),
    ),
    step("saatler", hasAnyHours(hours) ? ok(isAlwaysOpen(hours) ? "7/24 açık" : "Tamam") : missing("Saatler girilmedi")),
    {
      key: "fotograflar",
      href: routes.business.photos(),
      icon: ImagePlus,
      title: "Fotoğraflar",
      status: !b.cover_url
        ? missing("Kapak fotoğrafı eksik")
        : photoCount < MIN_PORTFOLIO_PHOTOS
          ? missing(`Galeride ${photoCount}/${MIN_PORTFOLIO_PHOTOS} fotoğraf`)
          : ok(`${photoCount} fotoğraf`),
    },
    // Same rule as Profil gücü: amenities are a task for places, optional for service firms.
    step(
      "ozellikler",
      b.amenities.length ? ok(`${b.amenities.length} olanak seçili`) : hasScope ? { done: null, label: "İsteğe bağlı" } : missing("Olanak seçilmedi"),
    ),
  ];
  if (hasScope) {
    const c = b.category_ids.length;
    const a = b.area_ids.length;
    pageRows.push(step("hizmet-alani", c && a ? ok(`${c} kategori · ${a} mahalle`) : missing(c ? "Mahalle seçilmedi" : "Kategori seçilmedi")));
  }

  const toolRows: HubRow[] = [];
  if (hasMenu(vertical)) {
    toolRows.push({ key: "menu", href: routes.business.menu(), icon: QrCode, title: "Menü ve QR", status: countStatus(counts.menuItems, "ürün", "Menün boş") });
  }
  if (hasRooms(vertical)) {
    toolRows.push({ key: "odalar", href: routes.business.rooms(), icon: BedDouble, title: "Odalar", status: countStatus(counts.rooms, "oda", "Oda eklenmedi") });
  }
  if (offersServices) {
    toolRows.push({
      key: "hizmetlerim",
      href: routes.business.services(),
      icon: Wrench,
      title: "Hizmetlerim ve fiyatlar",
      status: countStatus(counts.services, "hizmet", "Hizmet listen boş"),
    });
  }

  return (
    <>
      <PageHeader title="İşletme sayfamı düzenle" subtitle={b.name} backHref={routes.business.root()} />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-10">
        <p className="px-1 text-sm text-muted-foreground">Bir bölüm seç, sadece onu düzenle ve kaydet.</p>
        <Group title="İşletme sayfan" rows={pageRows} />
        <Group title="Araçlar" rows={toolRows} />
        <Link href={routes.businesses.detail(b.slug)} className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-primary">
          İşletme sayfamı gör <ExternalLink className="size-4" aria-hidden />
        </Link>
      </div>
    </>
  );
}
