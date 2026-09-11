"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, CircleAlert, Eye, Heart, Lightbulb, Pencil, PhoneCall, RefreshCw, Share2, Smartphone, Tag, Users, type LucideIcon } from "lucide-react";
import { formatNumber } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EDITABLE_STATUSES, type ListingStatus } from "../../constants";
import { daysLeft, effectiveStatus } from "../../format";
import { StatsChart } from "./stats-chart";
import { DAILY_STATS_SINCE, hasActivity, longDay, shortDay, sumStats, weekdayShort, type ListingStats, type ListingStatsListing, type StatKey } from "./stats-data";

type Range = "7" | "30";

const RANGES: ChipOption<Range>[] = [
  { value: "7", label: "7 gün" },
  { value: "30", label: "30 gün" },
];

const TILES: Array<{ key: StatKey; label: string; icon: LucideIcon }> = [
  { key: "views", label: "Görüntülenme", icon: Eye },
  { key: "unique_views", label: "Tekil ziyaretçi", icon: Users },
  { key: "calls", label: "Arama", icon: PhoneCall },
  { key: "phone_reveals", label: "Numara görüntüleme", icon: Smartphone },
  { key: "favorites_added", label: "Favori", icon: Heart },
  { key: "shares", label: "Paylaşım", icon: Share2 },
];

/** Per-day list: views and calls always, the rest only when they happened. */
const DAY_METRICS: Array<{ key: StatKey; label: string; icon: LucideIcon; always?: boolean }> = [
  { key: "views", label: "görüntülenme", icon: Eye, always: true },
  { key: "calls", label: "arama", icon: PhoneCall, always: true },
  { key: "phone_reveals", label: "numara görüntüleme", icon: Smartphone },
  { key: "favorites_added", label: "favori", icon: Heart },
  { key: "shares", label: "paylaşım", icon: Share2 },
];

function statusNote(status: ListingStatus): string | null {
  switch (status) {
    case "pending_review":
    case "draft":
      return "İlanın henüz yayında değil. Onaylanınca istatistikler burada birikir.";
    case "rejected":
      return "İlanın reddedildi, şu an kimse göremiyor. Düzenleyip tekrar onaya gönderebilirsin.";
    case "paused":
      return "İlanını durdurdun. Yeniden yayına alınca görüntülenmeler devam eder.";
    case "sold":
      return "İlan satıldı olarak işaretli. Geçmiş istatistikler aşağıda.";
    case "filled":
      return "İlan doldu olarak işaretli. Geçmiş istatistikler aşağıda.";
    default:
      return null;
  }
}

type Tip = { key: string; icon: LucideIcon; title: string; text: string; cta: string; href?: string; renew?: boolean };

/** Short, actionable tips when the numbers are low (or the listing is about to expire). */
function buildTips(l: ListingStatsListing, status: ListingStatus, periodViews: number, range: Range): Tip[] {
  if (status !== "active" && status !== "paused" && status !== "expired") return [];
  const isJob = l.type === "job";
  const low = periodViews < (range === "7" ? 20 : 60);
  const left = daysLeft(l.expiresAt);
  const editHref = EDITABLE_STATUSES.includes(l.status) ? withQuery(isJob ? routes.listings.postJob() : routes.listings.postClassified(), { duzenle: l.id }) : null;
  const tips: Tip[] = [];
  if (status === "expired" || left <= 7 || (low && left <= 20)) {
    tips.push({
      key: "renew",
      icon: RefreshCw,
      title: "Süreyi yenile",
      text: status === "expired" ? "İlanın süresi doldu. Yenile, 30 gün daha yayında kalsın." : `İlanının bitmesine ${left} gün kaldı. Yenile, 30 gün daha yayında kalsın.`,
      cta: "Süreyi yenile",
      renew: true,
    });
  }
  if (!low || !editHref) return tips;
  if (isJob) {
    tips.push({ key: "job", icon: Pencil, title: "İlanı güncelle", text: "Maaşı ve yan hakları açıkça yaz, daha çok aday arasın.", cta: "Düzenle", href: editHref });
    return tips;
  }
  if (l.photos < 3) {
    tips.push({
      key: "photo",
      icon: Camera,
      title: "Fotoğraf ekle",
      text: l.photos === 0 ? "Fotoğraflı ilanlara çok daha fazla bakılıyor." : "En az 3 net fotoğraf, alıcının güvenini artırır.",
      cta: "Fotoğraf ekle",
      href: editHref,
    });
  }
  tips.push({ key: "price", icon: Tag, title: "Fiyatı güncelle", text: "Benzer ilanlara göre uygun bir fiyat, daha çok kişinin aramasını sağlar.", cta: "Fiyatı güncelle", href: editHref });
  return tips;
}

/** Owner statistics of one listing: 6 tiles, 7/30 gün, daily chart, per-day list, tips, lifetime totals. */
export function ListingStatsView({ stats }: { stats: ListingStats }) {
  const router = useRouter();
  const [range, setRange] = React.useState<Range>("7");
  const [renewing, setRenewing] = React.useState(false);
  const l = stats.listing;
  const status = effectiveStatus({ status: l.status, expires_at: l.expiresAt });
  const days = stats.days.slice(range === "7" ? -7 : -30);
  const totals = sumStats(days);
  const n = days.length;
  const tips = buildTips(l, status, totals.views, range);
  const note = statusNote(status);
  const activeDays = [...days].reverse().filter(hasActivity);
  const showSince = !!l.publishedAt && l.publishedAt.slice(0, 10) < DAILY_STATS_SINCE;

  const renew = async () => {
    setRenewing(true);
    try {
      const { data, error } = await createClient().rpc("renew_listing", { p_listing_id: l.id });
      const res = (data ?? {}) as { ok?: boolean };
      if (error || !res.ok) {
        notify.error(error?.message ?? "Bu ilanın süresi yenilenemiyor.");
      } else {
        notify.success("İlanın süresi 30 gün uzatıldı");
        router.refresh();
      }
    } catch {
      notify.error("Bağlantı hatası. Lütfen tekrar dene.");
    }
    setRenewing(false);
  };

  return (
    <div className="flex flex-col gap-4 px-4 pt-3 pb-8">
      {note ? (
        <p className="flex items-start gap-2.5 rounded-2xl bg-highlight-soft px-4 py-3 text-sm text-highlight-foreground dark:text-foreground" role="note">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {note}
        </p>
      ) : null}

      <ChipFilter options={RANGES} value={range} onChange={(v) => v && setRange(v)} ariaLabel="Dönem" size="sm" />

      <p className="text-[15px] leading-snug">
        {totals.views ? (
          <>
            Son {n} günde ilanın <b className="tabular-nums">{formatNumber(totals.views)}</b> kez görüntülendi
            {totals.calls ? (
              <>
                , <b className="tabular-nums">{formatNumber(totals.calls)}</b> kez arandı
              </>
            ) : null}
            .
          </>
        ) : (
          <>Son {n} günde henüz görüntülenme yok.</>
        )}
      </p>

      <section aria-label="Özet">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TILES.map(({ key, label, icon: Icon }) => (
            <li key={key} className="rounded-2xl bg-card p-3.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-primary">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <p className="mt-2.5 text-2xl leading-none font-bold tabular-nums">{formatNumber(totals[key])}</p>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{label}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1 text-xs text-muted-foreground">Tekil ziyaretçi: aynı kişi bir günde bir kez sayılır.</p>
      </section>

      <section className="rounded-2xl bg-card p-4">
        <h2 className="text-[15px] font-semibold">Günlük görüntülenme</h2>
        <div className="mt-2">
          <StatsChart key={range} days={days} today={stats.to} />
        </div>
      </section>

      {tips.length ? (
        <section className="rounded-2xl bg-card p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Lightbulb className="size-[18px] text-primary" aria-hidden />
            Daha çok kişiye ulaş
          </h2>
          <ul className="mt-3 flex flex-col gap-4">
            {tips.map(({ key, icon: Icon, title, text, cta, href, renew: isRenew }) => (
              <li key={key} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-[13px] leading-snug text-muted-foreground">{text}</p>
                  {isRenew ? (
                    <Button type="button" size="sm" variant="secondary" className="mt-2 rounded-full" disabled={renewing} onClick={renew}>
                      <RefreshCw className={renewing ? "animate-spin" : undefined} aria-hidden />
                      {cta}
                    </Button>
                  ) : href ? (
                    <Button asChild size="sm" variant="secondary" className="mt-2 rounded-full">
                      <Link href={href}>{cta}</Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl bg-card p-4">
        <h2 className="text-[15px] font-semibold">Gün gün</h2>
        {activeDays.length ? (
          <ul className="mt-1 flex flex-col">
            {activeDays.map((d) => (
              <li key={d.day} className="flex items-center justify-between gap-3 py-2">
                <span className="shrink-0 text-sm">
                  <span className="font-semibold">{shortDay(d.day)}</span> <span className="text-muted-foreground">{d.day === stats.to ? "Bugün" : weekdayShort(d.day)}</span>
                </span>
                <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm tabular-nums">
                  {DAY_METRICS.filter((m) => m.always || d[m.key] > 0).map(({ key, label, icon: Icon }) => (
                    <span key={key} className="inline-flex items-center gap-1">
                      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                      {formatNumber(d[key])}
                      <span className="sr-only"> {label}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Bu dönemde henüz hareket yok.</p>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4">
        <h2 className="text-[15px] font-semibold">İlk günden bu yana</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Görüntülenme", value: l.viewCount },
            { label: "Arama", value: l.callCount },
            { label: "Favoride", value: l.favoritesNow },
          ].map((x) => (
            <div key={x.label} className="flex flex-col-reverse items-center gap-0.5 rounded-xl bg-muted/70 px-2 py-3 text-center">
              <dt className="text-xs text-muted-foreground">{x.label}</dt>
              <dd className="text-lg font-bold tabular-nums">{formatNumber(x.value)}</dd>
            </div>
          ))}
        </dl>
        {showSince ? <p className="mt-3 text-xs text-muted-foreground">Günlük veriler {longDay(DAILY_STATS_SINCE)} itibarıyla tutuluyor.</p> : null}
      </section>
    </div>
  );
}
