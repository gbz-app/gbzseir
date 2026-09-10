"use client";

import * as React from "react";
import { CircleDollarSign, Coins, DollarSign, Euro, Minus, PoundSterling, RefreshCw, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJson } from "@/lib/use-json";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ROUND_ICON_BUTTON } from "@/components/shared/explore-header";
import {
  MARKET_RANGES,
  RANGE_LABELS,
  RANGE_PERIODS,
  formatChange,
  formatPct,
  formatTry,
  trend,
  type MarketKey,
  type MarketQuote,
  type MarketRange,
  type MarketsPayload,
} from "../types";
import { PriceChart } from "./price-chart";

const ICONS: Record<MarketKey, LucideIcon> = { usd: DollarSign, eur: Euro, gbp: PoundSterling, gram_altin: Coins };

const TREND_TEXT = { up: "text-emerald-600 dark:text-emerald-400", down: "text-red-600 dark:text-red-400", flat: "text-muted-foreground" } as const;
const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

const TZ = "Europe/Istanbul";
const fmtTime = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
const fmtWeekdayTime = new Intl.DateTimeFormat("tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
const fmtDay = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: TZ });
const fmtDayYear = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });

function timeFormatter(range: MarketRange): (t: number) => string {
  if (range === "gunluk") return (t) => fmtTime.format(t);
  if (range === "haftalik") return (t) => fmtWeekdayTime.format(t);
  if (range === "aylik") return (t) => fmtDay.format(t);
  return (t) => fmtDayYear.format(t);
}

function Change({ pct, abs, className }: { pct: number | null; abs?: number | null; className?: string }) {
  if (pct == null) return <span className={cn("text-muted-foreground", className)}>-</span>;
  const t = trend(pct);
  const Icon = TREND_ICON[t];
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", TREND_TEXT[t], className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {formatPct(pct)}
      {abs != null ? <span className="font-medium opacity-80">({formatChange(abs)})</span> : null}
    </span>
  );
}

/** Header button (döviz işareti) that opens the Döviz ve Altın sheet. Data loads when the sheet opens. */
export function MarketsButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button type="button" aria-label="Döviz ve altın kurları" className={ROUND_ICON_BUTTON}>
          <CircleDollarSign className="size-5" strokeWidth={1.75} />
        </button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-2xl border-0 bg-background data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[1.75rem]">
        <DrawerHeader className="px-5 pt-3 pb-2 text-left">
          <DrawerTitle className="text-xl font-semibold">Döviz ve Altın</DrawerTitle>
          <DrawerDescription>Günlük, haftalık, aylık ve yıllık değişimler</DrawerDescription>
        </DrawerHeader>
        <div className="no-scrollbar overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          <MarketsBody enabled={open} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function MarketsBody({ enabled }: { enabled: boolean }) {
  const { data, error, loading, reload } = useJson<MarketsPayload>(enabled ? "/api/piyasa" : null);
  const [selected, setSelected] = React.useState<MarketKey>("usd");
  const [range, setRange] = React.useState<MarketRange>("gunluk");

  if (error) {
    return (
      <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-8 text-center shadow-soft ring-1 ring-foreground/[0.05]">
        <p className="font-semibold">Kurlar şu an alınamadı</p>
        <p className="mt-1 text-sm text-muted-foreground">Bağlantını kontrol edip tekrar dene.</p>
        <Button variant="outline" className="mt-4" onClick={reload}>
          <RefreshCw /> Tekrar dene
        </Button>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Kurlar yükleniyor">
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-10 rounded-full" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
    );
  }

  const quote: MarketQuote = data.quotes.find((q) => q.key === selected) ?? data.quotes[0];
  const series = quote.ranges[range];
  const t = trend(series.changePct);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Kur seç">
        {data.quotes.map((q) => {
          const Icon = ICONS[q.key];
          const active = q.key === quote.key;
          return (
            <button
              key={q.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(q.key)}
              className={cn(
                "flex flex-col gap-1.5 rounded-2xl p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-foreground text-background" : "bg-card shadow-soft ring-1 ring-foreground/[0.06]",
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn("flex size-7 items-center justify-center rounded-full", active ? "bg-background/15" : "bg-brand-soft text-primary")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="text-sm font-semibold">{q.label}</span>
              </span>
              <span className="text-[17px] font-semibold tabular-nums">{q.price != null ? formatTry(q.price) : "-"}</span>
              <Change pct={q.ranges[range].changePct} className={cn("text-xs", active && "text-background/90")} />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1" role="tablist" aria-label="Dönem">
        {MARKET_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={r === range}
            onClick={() => setRange(r)}
            className={cn(
              "h-9 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              r === range ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <section className="rounded-3xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.05]" aria-live="polite">
        <p className="text-sm font-medium text-muted-foreground">
          {quote.label} · {quote.pair}
        </p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{quote.price != null ? formatTry(quote.price) : "-"}</p>
        <p className="mt-1 text-sm">
          <Change pct={series.changePct} abs={series.change} /> <span className="text-muted-foreground">{RANGE_PERIODS[range]}</span>
        </p>
        <div className={cn("mt-5", t === "down" ? "text-red-500" : t === "up" ? "text-emerald-500" : "text-primary")}>
          <PriceChart key={`${quote.key}-${range}`} points={series.points} formatValue={formatTry} formatTime={timeFormatter(range)} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold">{quote.label} değişimleri</h3>
        <ul className="divide-y rounded-3xl bg-card shadow-soft ring-1 ring-foreground/[0.05]">
          {MARKET_RANGES.map((r) => (
            <li key={r}>
              <button
                type="button"
                onClick={() => setRange(r)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm outline-none focus-visible:bg-muted"
              >
                <span className="font-medium">
                  {RANGE_LABELS[r]} <span className="text-muted-foreground">({RANGE_PERIODS[r]})</span>
                </span>
                <Change pct={quote.ranges[r].changePct} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Kaynak: {data.sources.join(", ") || "-"}. Veriler gecikmeli olabilir ve bilgi amaçlıdır, yatırım tavsiyesi değildir. Gram altın, ons fiyatı ve
        dolar kurundan hesaplanır; kuyumcu fiyatlarından farklı olabilir. Güncelleme: {fmtTime.format(data.updatedAt)}
      </p>
    </div>
  );
}
