import Link from "next/link";
import { ArrowUpRight, ChevronRight, CloudSun, Cross, Globe, Landmark, Layers, Mail, MessageCircleQuestion, MoonStar, Newspaper, Phone, type LucideIcon } from "lucide-react";
import { DemoBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { APP_NAME, CITY } from "@/config/site";
import { formatNumber } from "@/core/format";
import { telHref } from "@/core/phone";
import { routes } from "@/core/routes";
import { displayTrPhone, getAppSettings } from "@/lib/app-settings";
import { cn } from "@/lib/utils";
import { NEWS_REVALIDATE_SECONDS } from "@/features/content/news/get-news";
import { contentMetadata } from "@/features/content/seo";
import { SOURCE_URLS, getSourcesPageData, sourceDatasets, type Dataset, type NewsSourceLink } from "@/features/content/sources";
import { ECZACI_ODASI_NAME, ECZACI_ODASI_URL, OSM_COPYRIGHT_URL } from "@/features/nearby/config";
import { getDutyMode } from "@/features/nearby/server/queries";
import type { DutyMode } from "@/features/nearby/types";

// Sources and counts refresh hourly or when an admin edit expires their tags (settings: 60 s). Must be a literal.
export const revalidate = 3600;

const TITLE = "Kaynaklar";
const DESCRIPTION = `${APP_NAME}'de kullanılan veri kaynakları, lisanslar ve atıflar: Kocaeli Büyükşehir Belediyesi Açık Veri, OpenStreetMap, hava durumu, namaz vakitleri ve yerel haber siteleri.`;

export const metadata = contentMetadata({ title: TITLE, description: DESCRIPTION, path: routes.content.sources() });

const TONES = {
  kbb: "bg-brand-soft text-primary",
  osm: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  tiles: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  duty: "bg-highlight-soft text-highlight-foreground dark:text-highlight",
  weather: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  prayer: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
} as const;

type SourceLink = { label: string; href: string };

const KBB_PHARMACY_NOTE = "Eczanelerin adres ve telefonları Kocaeli Büyükşehir Belediyesi Açık Veri'den gelir.";

/** Duty card copy per app_settings.duty_data_mode (same wording as the /yardim FAQ). */
const DUTY_COPY: Record<DutyMode, { subtitle: string; text: string }> = {
  demo: {
    subtitle: "Şu an örnek veri gösteriliyor",
    text: `Nöbet listesi şu an prototip için hazırlanmış örnek veridir, gerçek nöbet bilgisi değildir. Güncel ve resmi liste için ${ECZACI_ODASI_NAME}'nın sitesine bakabilirsin. ${KBB_PHARMACY_NOTE}`,
  },
  off: {
    subtitle: "Şu an gösterilmiyor",
    text: `Nöbet listesini şu an göstermiyoruz. Güncel ve resmi liste için ${ECZACI_ODASI_NAME}'nın sitesine bakabilirsin. ${KBB_PHARMACY_NOTE}`,
  },
  live: {
    subtitle: `Kaynak: ${ECZACI_ODASI_NAME}`,
    text: `Nöbet listesi ${ECZACI_ODASI_NAME}'nın resmi nöbet listesine göre güncellenir. ${KBB_PHARMACY_NOTE} Gitmeden önce eczaneyi aramanı öneririz.`,
  },
};

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary outline-none focus-visible:underline">
      {children}
      <ArrowUpRight className="size-4" aria-hidden />
    </a>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

type SourceCardProps = {
  icon: LucideIcon;
  tone: string;
  title: string;
  subtitle?: string;
  /** Licence or demo badge next to the title. */
  badge?: React.ReactNode;
  datasets?: Dataset[];
  links?: SourceLink[];
  children: React.ReactNode;
};

function SourceCard({ icon: Icon, tone, title, subtitle, badge, datasets, links, children }: SourceCardProps) {
  return (
    <article className="rounded-3xl bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", tone)}>
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="leading-snug font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          {badge ? <div className="mt-1.5 flex flex-wrap gap-1.5">{badge}</div> : null}
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</p>
      {datasets?.length ? (
        <ul className="mt-3 flex flex-col gap-1 rounded-2xl bg-muted/60 px-3 py-2">
          {datasets.map((d) => (
            <li key={d.key} className="flex items-baseline justify-between gap-3 text-sm">
              <span>{d.label}</span>
              {d.count !== null ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatNumber(d.count)} kayıt</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {links?.length ? (
        <div className="mt-1 flex flex-wrap gap-x-5">
          {links.map((l) => (
            <ExternalLink key={l.href} href={l.href}>
              {l.label}
            </ExternalLink>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function LicenceBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="h-6 px-2.5">
      {label}
    </Badge>
  );
}

function NewsSourceRow({ source }: { source: NewsSourceLink }) {
  const body = (
    <>
      <Newspaper className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{source.name}</span>
        {source.host ? <span className="block truncate text-xs text-muted-foreground">{source.host}</span> : null}
      </span>
      {source.url ? <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </>
  );
  const row = "flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2";
  return source.url ? (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(row, "outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50")}
    >
      {body}
    </a>
  ) : (
    <div className={row}>{body}</div>
  );
}

/** Veri kaynakları, lisanslar ve atıflar; haber kaynakları DB'den, iletişim bilgisi uygulama ayarlarından. */
export default async function SourcesPage() {
  const [data, settings, dutyMode] = await Promise.all([getSourcesPageData(), getAppSettings(), getDutyMode()]);
  const duty = DUTY_COPY[dutyMode];
  const news = data.newsSources;
  const feedMinutes = Math.round(NEWS_REVALIDATE_SECONDS / 60);
  const contactCount = (settings.supportPhone ? 1 : 0) + (settings.supportEmail ? 1 : 0);

  return (
    <>
      <PageHeader title={TITLE} subtitle="Veri kaynakları ve atıflar" />
      <div className="flex flex-col gap-7 px-4 pt-4 pb-10">
        <header>
          <h2 className="text-[1.6rem] leading-tight font-semibold tracking-tight">Bilgiler nereden geliyor?</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
            {`${APP_NAME}'deki bilgilerin bir kısmı açık veri kaynaklarından ve herkese açık servislerden gelir. Kullandığımız kaynakları ve lisanslarını burada topladık.`}
          </p>
        </header>

        <Section id="harita-ve-yerler" title="Harita ve yer bilgileri">
          <SourceCard
            icon={Landmark}
            tone={TONES.kbb}
            title="Kocaeli Büyükşehir Belediyesi Açık Veri"
            badge={<LicenceBadge label="CC BY 4.0" />}
            datasets={sourceDatasets("kbb", data.poiCounts)}
            links={[
              { label: "Açık veri portalı", href: SOURCE_URLS.kbbPortal },
              { label: "CC BY 4.0 lisansı", href: SOURCE_URLS.ccBy },
            ]}
          >
            {`${CITY.name}'deki eczanelerin, camilerin ve tarihi yerlerin adı, adresi, telefonu ve konumu belediyenin açık veri portalından alınır. Konumları haritada kullanılan koordinat sistemine dönüştürdük, adresleri okunur hale getirdik.`}
          </SourceCard>

          <SourceCard
            icon={Globe}
            tone={TONES.osm}
            title="OpenStreetMap"
            subtitle="© OpenStreetMap katkıcıları"
            badge={<LicenceBadge label="ODbL" />}
            datasets={sourceDatasets("osm", data.poiCounts)}
            links={[
              { label: "Telif ve lisans", href: OSM_COPYRIGHT_URL },
              { label: "ODbL lisansı", href: SOURCE_URLS.odbl },
            ]}
          >
            {`Otobüs durakları ve geçen hatlar, taksi durakları, ATM'ler, parklar ve mahalle sınırları OpenStreetMap'ten alınır. OpenStreetMap verisi Open Database License (ODbL) ile paylaşılır.`}
          </SourceCard>

          <SourceCard
            icon={Layers}
            tone={TONES.tiles}
            title="Google Haritalar"
            subtitle="Harita görüntüleri"
            links={[
              { label: "Google Haritalar kullanım şartları", href: SOURCE_URLS.googleMapsTerms },
              { label: "Google gizlilik politikası", href: SOURCE_URLS.googlePrivacy },
            ]}
          >
            Uygulamadaki haritalar Google Haritalar ile gösterilir ve yalnızca sen açtığında yüklenir. Harita görüntüleri ve harita verisi © Google; haritadaki yerlerin bilgileri bu sayfadaki kaynaklardan gelir.
          </SourceCard>
        </Section>

        <Section id="nobetci-eczane" title="Nöbetçi eczane">
          <SourceCard
            icon={Cross}
            tone={TONES.duty}
            title="Nöbetçi eczane listesi"
            subtitle={duty.subtitle}
            badge={dutyMode === "demo" ? <DemoBadge /> : null}
            links={[{ label: `${ECZACI_ODASI_NAME} sitesi`, href: ECZACI_ODASI_URL }]}
          >
            {duty.text}
          </SourceCard>
        </Section>

        <Section id="hava-ve-vakitler" title="Hava durumu ve namaz vakitleri">
          <SourceCard
            icon={CloudSun}
            tone={TONES.weather}
            title="Open-Meteo"
            subtitle="Hava durumu"
            badge={<LicenceBadge label="CC BY 4.0" />}
            links={[
              { label: "open-meteo.com", href: SOURCE_URLS.openMeteo },
              { label: "CC BY 4.0 lisansı", href: SOURCE_URLS.ccBy },
            ]}
          >
            {`Anlık hava durumu ve 5 günlük tahmin, ${CITY.name} merkezi için Open-Meteo'dan alınır. Tahminler saatlik güncellenir.`}
          </SourceCard>

          <SourceCard icon={MoonStar} tone={TONES.prayer} title="AlAdhan" subtitle="Namaz vakitleri" links={[{ label: "aladhan.com", href: SOURCE_URLS.aladhan }]}>
            {`Namaz vakitleri AlAdhan servisinden, Diyanet İşleri Başkanlığı yöntemiyle ${CITY.name} merkezine göre hesaplanır. Resmi takvimle birkaç dakikalık fark olabilir.`}
          </SourceCard>
        </Section>

        <Section
          id="haber-kaynaklari"
          title="Gebze Gündemi haber kaynakları"
          description="Başlıklar ve en fazla 280 karakterlik özetler bu sitelerin herkese açık RSS akışlarından otomatik alınır; habere dokununca kaynağında açılır. Haberlerin tamamı ve tüm hakları yayıncılarına aittir."
        >
          {news === null ? (
            <p className="rounded-2xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">Kaynak listesi şu an yüklenemedi. Biraz sonra tekrar dene.</p>
          ) : news.length ? (
            <ul className="flex flex-col gap-0.5 rounded-3xl bg-card p-2">
              {news.map((s) => (
                <li key={s.id}>
                  <NewsSourceRow source={s} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">Şu an etkin bir haber kaynağı yok.</p>
          )}
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            {`Akışlar yaklaşık ${feedMinutes} dakikada bir "GebzemNews" adıyla okunur. Başlıkları `}
            <Link href={routes.content.news()} className="font-semibold text-foreground underline underline-offset-2">
              Gebze Gündemi
            </Link>
            {" sayfasında görebilirsin."}
          </p>
        </Section>

        <Section
          id="kaldirma-talepleri"
          title="Kaldırma ve düzeltme talepleri"
          description="İçeriğinin kaldırılmasını ya da haber sitenin bu listeden çıkarılmasını istiyorsan veya bir kaynağı ya da lisansı yanlış belirttiğimizi düşünüyorsan bize yaz. Talebini inceleyip en kısa sürede dönüş yaparız."
        >
          {contactCount ? (
            <div className={cn("grid gap-2.5", contactCount === 2 ? "grid-cols-2" : "grid-cols-1")}>
              {settings.supportPhone ? (
                <a href={telHref(settings.supportPhone)} className="flex min-w-0 flex-col gap-1 rounded-3xl bg-card p-4">
                  <Phone className="size-5 text-primary" aria-hidden />
                  <span className="mt-1 text-xs text-muted-foreground">Telefon</span>
                  <span className="truncate text-sm font-semibold">{displayTrPhone(settings.supportPhone)}</span>
                </a>
              ) : null}
              {settings.supportEmail ? (
                <a
                  href={`mailto:${settings.supportEmail}?subject=${encodeURIComponent("Kaynak / kaldırma talebi")}`}
                  className="flex min-w-0 flex-col gap-1 rounded-3xl bg-card p-4"
                >
                  <Mail className="size-5 text-primary" aria-hidden />
                  <span className="mt-1 text-xs text-muted-foreground">E-posta</span>
                  <span className="text-sm font-semibold break-all">{settings.supportEmail}</span>
                </a>
              ) : null}
            </div>
          ) : null}
          <Link href={routes.content.help("diger")} className="flex min-h-14 items-center gap-3 rounded-3xl bg-card px-4 py-3">
            <MessageCircleQuestion className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-semibold">Destek formundan yaz</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </Section>

        <p className="rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {`${APP_NAME}'in kendi haberleri ve gezilecek yer açıklamaları ${APP_NAME} ekibi tarafından hazırlanır. İşletme, ilan ve etkinlik bilgileri onları ekleyen kullanıcılara ve işletmelere aittir.`}
        </p>
      </div>
    </>
  );
}
