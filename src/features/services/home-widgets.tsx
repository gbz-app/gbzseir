import Link from "next/link";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/shared/section-header";
import { routes } from "@/core/routes";
import { getServiceCatalogSafe } from "./data";
import { ServiceIconBubble } from "./components/service-icon";

export type PopularServicesRailProps = {
  /** Section title (default "Popüler hizmetler"). */
  title?: string;
  /** Optional line under the title. */
  description?: string;
  className?: string;
};

/**
 * Home widget (server component): horizontal rail of popular sub-categories, each opening the request wizard.
 * Fetches its own data (cached, 10 min); renders nothing when the catalog is unavailable or empty.
 */
export async function PopularServicesRail({ title = "Popüler hizmetler", description = "Birkaç soruda ücretsiz talep oluştur", className }: PopularServicesRailProps) {
  const catalog = await getServiceCatalogSafe();
  const popular = catalog?.subs.filter((s) => s.popular) ?? [];
  if (popular.length === 0) return null;
  return (
    <section aria-labelledby="home-populer-hizmetler" className={cn("flex flex-col gap-3", className)}>
      <SectionHeader title={<span id="home-populer-hizmetler">{title}</span>} description={description} href={routes.services.root()} linkLabel="Tümü" />
      <ul className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pt-0.5 pb-2">
        {popular.map((s) => (
          <li key={s.slug} className="shrink-0 snap-start">
            <Link
              href={routes.services.request(s.slug)}
              className="flex h-full w-28 flex-col items-center gap-2 rounded-2xl bg-card px-2 py-3 text-center shadow-soft ring-1 ring-foreground/[0.06] transition-[box-shadow,transform] outline-none hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97]"
            >
              <ServiceIconBubble name={s.icon} />
              <span className="line-clamp-2 text-[13px] leading-tight font-semibold">{s.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
