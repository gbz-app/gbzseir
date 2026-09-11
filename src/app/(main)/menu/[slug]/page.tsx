import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, TreePalm, UtensilsCrossed } from "lucide-react";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { APP_NAME, CITY } from "@/config/site";
import { routes } from "@/core/routes";
import { BusinessLogo } from "@/features/business/components/business-logo";
import { MenuSections, menuItemCount } from "@/features/business/components/menu-view";
import { OpenNowStatus } from "@/features/business/components/open-now";
import { hasAnyHours, isOnVacation, parseWorkingHours, vacationReturnLabel } from "@/features/business/lib/hours";
import { getPublicBusinessBySlug } from "@/features/business/lib/queries";
import { getBusinessMenu } from "@/features/business/lib/vertical-queries";

export const revalidate = 120;

export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

function normalizeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await getPublicBusinessBySlug(normalizeSlug((await params).slug)).catch(() => null);
  if (!b) return { title: "Menü bulunamadı", robots: { index: false } };
  return {
    title: `${b.name} menü`,
    description: `${b.name} (${CITY.name}) menüsü ve fiyatları. ${APP_NAME} QR menü.`,
    alternates: { canonical: routes.businesses.menu(b.slug) },
  };
}

/** Public QR menü: the page a table QR code opens. Works without login, no bottom nav. */
export default async function PublicMenuPage({ params }: Props) {
  const b = await getPublicBusinessBySlug(normalizeSlug((await params).slug));
  if (!b) notFound();
  const menu = await getBusinessMenu(b.id).catch(() => []);
  const hours = parseWorkingHours(b.working_hours);
  const count = menuItemCount(menu);
  const vacation = { vacation_mode: b.vacation_mode, vacation_until: b.vacation_until };
  // Server time of this (ISR) render; the header status below is re-checked on the client.
  const onVacation = isOnVacation(vacation);
  const back = onVacation ? vacationReturnLabel(b.vacation_until) : null;

  return (
    <div className="min-h-dvh pb-16">
      <HideBottomNav />
      <header className="px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
        <div className="flex items-center gap-3">
          <BusinessLogo name={b.name} url={b.logo_url ?? b.cover_url} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Menü</p>
            <h1 className="truncate text-xl leading-tight font-semibold">{b.name}</h1>
            <div className="mt-0.5 text-sm">{hasAnyHours(hours) || b.vacation_mode ? <OpenNowStatus hours={hours} vacation={vacation} /> : null}</div>
          </div>
        </div>
        {onVacation ? (
          <div role="note" className="mt-4 flex items-start gap-3 rounded-2xl bg-highlight-soft px-4 py-3 text-sm text-highlight-foreground dark:text-foreground">
            <TreePalm className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
            <p>
              <strong className="block">Şu an tatildeyiz</strong>
              {back ? `Dönüş tarihimiz: ${back}. ` : null}Menüye yine de göz atabilirsin.
            </p>
          </div>
        ) : null}
      </header>

      {menu.length > 1 ? (
        <nav
          aria-label="Menü bölümleri"
          className="no-scrollbar sticky top-0 z-30 mt-4 flex gap-2 overflow-x-auto bg-background/90 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2 backdrop-blur-md"
        >
          {menu.map((s) => (
            <a
              key={s.id}
              href={`#m-${s.id}`}
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-card px-3.5 text-sm font-medium shadow-soft ring-1 ring-foreground/[0.07] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {s.name}
            </a>
          ))}
        </nav>
      ) : null}

      <main className="px-4 pt-4">
        {count ? (
          <MenuSections sections={menu} anchorPrefix="m-" />
        ) : (
          <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center shadow-soft ring-1 ring-foreground/[0.05]">
            <UtensilsCrossed className="size-10 text-primary/50" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 font-semibold">Menü henüz eklenmedi</p>
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">Fiyatlara KDV dahildir. Fiyat ve ürünler işletme tarafından güncellenir.</p>
        <Link
          href={routes.businesses.detail(b.slug)}
          className="mt-4 flex items-center justify-between gap-3 rounded-3xl bg-card p-4 text-sm shadow-soft ring-1 ring-foreground/[0.05] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span>
            <span className="block font-semibold">{b.name}</span>
            <span className="text-muted-foreground">İşletme sayfası, yorumlar ve yol tarifi</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
        <p className="mt-6 text-center text-xs text-muted-foreground">{APP_NAME} QR Menü</p>
      </main>
    </div>
  );
}
