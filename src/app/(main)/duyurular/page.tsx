import { Droplets, PhoneCall, Zap } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBanner } from "@/components/shared/demo-data-banner";
import { ErrorState } from "@/components/shared/error-state";
import { routes } from "@/core/routes";
import { getActiveAnnouncements } from "@/features/content/announcements/get-announcements";
import { AnnouncementsList } from "@/features/content/announcements/announcements-list";
import { contentMetadata } from "@/features/content/seo";

// Announcements are cached for 5 minutes; expiry is re-checked on the client at render time.
export const revalidate = 300;

export const metadata = contentMetadata({
  title: "Duyurular",
  description: "Kocaeli'de planlı su ve elektrik kesintileri, belediye ve genel duyurular: tarih, saat ve etkilenen ilçeler.",
  path: routes.content.announcements(),
});

const HOTLINES = [
  { number: "185", label: "Su arıza", note: "İSU", icon: Droplets, tone: "text-info" },
  { number: "186", label: "Elektrik arıza", note: "SEDAŞ", icon: Zap, tone: "text-highlight" },
] as const;

export default async function AnnouncementsPage() {
  const { items, failed, renderedAt } = await getActiveAnnouncements();
  const hasDemo = items.some((a) => a.isDemo);

  return (
    <>
      <PageHeader title="Duyurular" subtitle="Kesintiler ve belediye duyuruları" />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
        {hasDemo ? (
          <DemoDataBanner compact>
            Bu sayfadaki duyurular prototip için hazırlanmış örnek verilerdir; gerçek kesinti bilgisi değildir.
          </DemoDataBanner>
        ) : null}

        {failed ? (
          <ErrorState compact description="Duyurular şu an yüklenemedi. Biraz sonra tekrar dene." />
        ) : (
          <AnnouncementsList items={items} renderedAt={renderedAt} />
        )}

        <section aria-labelledby="ariza-hatlari" className="rounded-2xl bg-muted/70 p-4">
          <h2 id="ariza-hatlari" className="flex items-center gap-2 text-sm font-bold">
            <PhoneCall className="size-4 text-muted-foreground" aria-hidden />
            Arıza ve kesinti hatları
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Güncel ve resmi kesinti bilgisi için ilgili kurumu arayabilirsin. Kocaeli&apos;de su hizmetlerini İSU, elektrik dağıtımını SEDAŞ yürütür.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {HOTLINES.map((h) => (
              <a
                key={h.number}
                href={`tel:${h.number}`}
                className="flex min-h-12 items-center gap-2.5 rounded-xl bg-card px-3 py-2 shadow-soft ring-1 ring-foreground/[0.06] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <h.icon className={`size-5 shrink-0 ${h.tone}`} aria-hidden />
                <span className="min-w-0 leading-tight">
                  <span className="block text-base font-extrabold tabular-nums">{h.number}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {h.label} · {h.note}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
