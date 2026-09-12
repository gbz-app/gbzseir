"use client";

import * as React from "react";
import { CloudSun, Droplets, RefreshCw, Thermometer, Wind } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY } from "@/config/site";
import { istanbulDateKey } from "@/core/time";
import { useJson } from "@/lib/use-json";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ROUND_ICON_BUTTON } from "@/components/shared/explore-header";
import { describeWeather } from "@/features/nearby/lib/weather";
import type { Forecast, WeatherDay } from "../types";

const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "Europe/Istanbul" });

function dayLabel(date: string): string {
  const today = istanbulDateKey(new Date());
  const tomorrow = istanbulDateKey(new Date(Date.now() + 86_400_000));
  if (date === today) return "Bugün";
  if (date === tomorrow) return "Yarın";
  return weekday.format(new Date(`${date}T12:00:00+03:00`));
}

const round = (v: number) => Math.round(v);

/**
 * Header weather pill (icon + temperature) that opens the 5-day forecast sheet. `className` replaces the default round
 * look (ROUND_ICON_BUTTON has a shadow and a ring that tailwind-merge cannot cancel with shadow-none).
 */
export function WeatherButton({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const { data, error, loading, reload } = useJson<Forecast>("/api/hava", 30 * 60_000);
  const info = data ? describeWeather(data.now.code, data.now.isDay) : null;
  const Icon = info?.icon ?? CloudSun;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={data ? `Hava durumu: ${round(data.now.temperature)} derece, ${info?.label}` : "Hava durumu"}
          className={cn(className ?? ROUND_ICON_BUTTON, data && "w-auto gap-1 px-3")}
        >
          <Icon className="size-5" strokeWidth={2.25} />
          {data ? <span className="text-sm font-semibold tabular-nums">{round(data.now.temperature)}°</span> : null}
        </button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-2xl border-0 bg-background data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-card">
        <DrawerHeader className="px-5 pt-3 pb-2 text-left">
          <DrawerTitle className="text-xl font-semibold">{CITY.name} hava durumu</DrawerTitle>
          <DrawerDescription>5 günlük tahmin</DrawerDescription>
        </DrawerHeader>
        <div className="no-scrollbar overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
          {error ? (
            <div className="flex flex-col items-center rounded-card bg-card px-6 py-8 text-center">
              <p className="font-semibold">Hava durumu şu an alınamadı</p>
              <Button variant="outline" className="mt-4" onClick={reload}>
                <RefreshCw /> Tekrar dene
              </Button>
            </div>
          ) : loading || !data ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Hava durumu yükleniyor">
              <Skeleton className="h-36 rounded-3xl" />
              <Skeleton className="h-72 rounded-3xl" />
            </div>
          ) : (
            <ForecastBody data={data} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function ForecastBody({ data }: { data: Forecast }) {
  const now = data.now;
  const info = describeWeather(now.code, now.isDay);
  const lo = Math.min(...data.days.map((d) => d.min));
  const hi = Math.max(...data.days.map((d) => d.max));
  const span = hi - lo || 1;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center gap-4 rounded-3xl bg-linear-to-br from-sky-100 via-brand-soft to-amber-50 p-5 dark:from-sky-500/15 dark:via-brand-soft dark:to-amber-500/10">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-card bg-white/70 text-sky-600 dark:bg-white/10 dark:text-sky-300">
          <info.icon className="size-9" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-5xl leading-none font-semibold tracking-tight tabular-nums">{round(now.temperature)}°</p>
          <p className="mt-1.5 font-semibold">{info.label}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {now.apparent != null ? (
              <span className="inline-flex items-center gap-1">
                <Thermometer className="size-3.5" aria-hidden /> Hissedilen {round(now.apparent)}°
              </span>
            ) : null}
            {now.humidity != null ? (
              <span className="inline-flex items-center gap-1">
                <Droplets className="size-3.5" aria-hidden /> Nem %{round(now.humidity)}
              </span>
            ) : null}
            {now.wind != null ? (
              <span className="inline-flex items-center gap-1">
                <Wind className="size-3.5" aria-hidden /> {round(now.wind)} km/sa
              </span>
            ) : null}
          </p>
        </div>
      </section>

      <ul className="divide-y rounded-card bg-card" aria-label="5 günlük tahmin">
        {data.days.map((d) => (
          <DayRow key={d.date} day={d} lo={lo} span={span} />
        ))}
      </ul>
    </div>
  );
}

function DayRow({ day, lo, span }: { day: WeatherDay; lo: number; span: number }) {
  const info = describeWeather(day.code, true);
  const left = ((day.min - lo) / span) * 100;
  const width = Math.max(6, ((day.max - day.min) / span) * 100);
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <span className="w-[5.5rem] shrink-0 text-sm font-semibold capitalize">{dayLabel(day.date)}</span>
      <span className="flex w-14 shrink-0 flex-col items-center">
        <info.icon className="size-6 text-sky-600 dark:text-sky-300" strokeWidth={1.75} aria-label={info.label} />
        {day.rain != null && day.rain >= 10 ? <span className="mt-0.5 text-[11px] font-semibold text-sky-600 tabular-nums dark:text-sky-300">%{round(day.rain)}</span> : null}
      </span>
      <span className="w-8 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{round(day.min)}°</span>
      <span className="relative h-1.5 min-w-0 flex-1 rounded-full bg-muted" aria-hidden>
        <span className="absolute inset-y-0 rounded-full bg-linear-to-r from-sky-400 to-amber-400" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
      </span>
      <span className="w-8 shrink-0 text-sm font-semibold tabular-nums">{round(day.max)}°</span>
    </li>
  );
}
