/** Döviz + altın: shared types and tr-TR formatting (pure TS, client and server safe). */

export const MARKET_KEYS = ["usd", "eur", "gbp", "gram_altin"] as const;
export type MarketKey = (typeof MARKET_KEYS)[number];

export const MARKET_RANGES = ["gunluk", "haftalik", "aylik", "yillik"] as const;
export type MarketRange = (typeof MARKET_RANGES)[number];

export const RANGE_LABELS: Record<MarketRange, string> = { gunluk: "Günlük", haftalik: "Haftalık", aylik: "Aylık", yillik: "Yıllık" };
export const RANGE_PERIODS: Record<MarketRange, string> = { gunluk: "son 24 saat", haftalik: "son 1 hafta", aylik: "son 1 ay", yillik: "son 1 yıl" };

/** [epoch ms, value in TRY] */
export type MarketPoint = [number, number];

export type RangeSeries = { points: MarketPoint[]; change: number | null; changePct: number | null };

export type MarketQuote = {
  key: MarketKey;
  label: string;
  pair: string;
  /** Latest price in TRY (null = unavailable). */
  price: number | null;
  ranges: Record<MarketRange, RangeSeries>;
};

export type MarketsPayload = { quotes: MarketQuote[]; sources: string[]; updatedAt: number };

const tryFmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 48.5405 -> "48,54 ₺" */
export function formatTry(v: number): string {
  return `${tryFmt.format(v)} ₺`;
}

/** Signed change: "+0,12 ₺" / "-1,05 ₺" */
export function formatChange(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${tryFmt.format(Math.abs(v))} ₺`;
}

/** Turkish percent (sign first, % before the number): "+%1,25" / "-%0,40" / "%0,00" */
export function formatPct(p: number): string {
  return `${p > 0 ? "+" : p < 0 ? "-" : ""}%${pctFmt.format(Math.abs(p))}`;
}

export function trend(p: number | null | undefined): "up" | "down" | "flat" {
  if (p == null || Math.abs(p) < 0.005) return "flat";
  return p > 0 ? "up" : "down";
}
