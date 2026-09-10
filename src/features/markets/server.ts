import "server-only";
import { MARKET_RANGES, type MarketKey, type MarketPoint, type MarketQuote, type MarketRange, type MarketsPayload, type RangeSeries } from "./types";

/**
 * Döviz ve gram altın serileri.
 * Primary: Yahoo Finance chart API (USDTRY=X, EURTRY=X, GBPTRY=X and COMEX gold GC=F in USD/ons).
 * Fallbacks: ECB reference rates via Frankfurter (currencies, daily) and gold-api.com (gold spot, price only).
 * Gram altın = ons (USD) × USD/TRY ÷ 31,1035. Every upstream call is cached in the Next data cache.
 */

const TROY_OUNCE_GRAMS = 31.1034768;
const UA = "Mozilla/5.0 (compatible; Gebzem/0.1; +https://gbzsehir.vercel.app)";
const TIMEOUT_MS = 7000;
const DAY_MS = 86_400_000;

const YAHOO_PARAMS: Record<MarketRange, { range: string; interval: string; revalidate: number; windowMs?: number }> = {
  gunluk: { range: "2d", interval: "15m", revalidate: 600, windowMs: DAY_MS },
  haftalik: { range: "5d", interval: "60m", revalidate: 1800 },
  aylik: { range: "1mo", interval: "1d", revalidate: 3600 },
  yillik: { range: "1y", interval: "1d", revalidate: 21600 },
};

type Currency = "USD" | "EUR" | "GBP";
const DEFS: Array<{ key: MarketKey; label: string; pair: string; yahoo: string; ecb?: Currency }> = [
  { key: "usd", label: "Dolar", pair: "USD/TRY", yahoo: "USDTRY=X", ecb: "USD" },
  { key: "eur", label: "Euro", pair: "EUR/TRY", yahoo: "EURTRY=X", ecb: "EUR" },
  { key: "gbp", label: "Sterlin", pair: "GBP/TRY", yahoo: "GBPTRY=X", ecb: "GBP" },
  { key: "gram_altin", label: "Gram altın", pair: "Gram / TRY", yahoo: "GC=F" },
];

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; regularMarketTime?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }> | null;
  };
};

async function getJson<T>(url: string, revalidate: number): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate, tags: ["markets"] },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
}

/** Drop single bad ticks: a point far (>1%) from both neighbours while the neighbours agree (<0,3%). */
function despike(pts: MarketPoint[]): MarketPoint[] {
  if (pts.length < 3) return pts;
  return pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const a = pts[i - 1][1];
    const b = pts[i + 1][1];
    const mid = (a + b) / 2;
    return !(Math.abs(a - b) / mid < 0.003 && Math.abs(p[1] - mid) / mid > 0.01);
  });
}

async function yahooSeries(symbol: string, range: MarketRange): Promise<MarketPoint[]> {
  const p = YAHOO_PARAMS[range];
  const json = await getJson<YahooChart>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${p.range}&interval=${p.interval}`,
    p.revalidate,
  );
  const result = json.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  let pts: MarketPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const v = closes[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) pts.push([ts[i] * 1000, v]);
  }
  const meta = result?.meta;
  if (meta?.regularMarketPrice && meta.regularMarketTime && (!pts.length || meta.regularMarketTime * 1000 > pts[pts.length - 1][0])) {
    pts.push([meta.regularMarketTime * 1000, meta.regularMarketPrice]);
  }
  pts = despike(pts);
  if (p.windowMs && pts.length) {
    const cutoff = pts[pts.length - 1][0] - p.windowMs;
    const inWindow = pts.filter(([t]) => t >= cutoff);
    if (inWindow.length >= 2) pts = inWindow;
  }
  if (pts.length < 2) throw new Error(`yahoo ${symbol} ${range}: no data`);
  return pts;
}

/** ECB daily reference rates for the last year (Frankfurter). */
async function ecbYear(cur: Currency): Promise<MarketPoint[]> {
  const start = new Date(Date.now() - 366 * DAY_MS).toISOString().slice(0, 10);
  const json = await getJson<{ rates?: Record<string, { TRY?: number }> }>(`https://api.frankfurter.app/${start}..?from=${cur}&to=TRY`, 21600);
  const pts = Object.entries(json.rates ?? {})
    .map(([date, r]) => [Date.parse(`${date}T15:00:00Z`), r.TRY ?? NaN] as MarketPoint)
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v) && v > 0)
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) throw new Error(`ecb ${cur}: no data`);
  return pts;
}

function lastDays(pts: MarketPoint[], days: number): MarketPoint[] {
  const cutoff = pts[pts.length - 1][0] - days * DAY_MS;
  const out = pts.filter(([t]) => t >= cutoff);
  return out.length >= 2 ? out : pts.slice(-2);
}

/** Gold USD/ons × nearest USD/TRY ÷ ons grams. Both series sorted by time. */
function toGramTry(goldUsd: MarketPoint[], usdTry: MarketPoint[]): MarketPoint[] {
  let j = 0;
  return goldUsd.map(([t, g]) => {
    while (j + 1 < usdTry.length && Math.abs(usdTry[j + 1][0] - t) <= Math.abs(usdTry[j][0] - t)) j++;
    return [t, (g * usdTry[j][1]) / TROY_OUNCE_GRAMS] as MarketPoint;
  });
}

function stats(points: MarketPoint[]): RangeSeries {
  if (points.length < 2) return { points, change: null, changePct: null };
  const first = points[0][1];
  const last = points[points.length - 1][1];
  const round = (v: number) => Math.round(v * 10_000) / 10_000;
  return { points: points.map(([t, v]) => [t, round(v)] as MarketPoint), change: round(last - first), changePct: first ? round(((last - first) / first) * 100) : null };
}

const EMPTY: RangeSeries = { points: [], change: null, changePct: null };
const emptyRanges = (): Record<MarketRange, RangeSeries> => ({ gunluk: EMPTY, haftalik: EMPTY, aylik: EMPTY, yillik: EMPTY });

type Series = Record<MarketRange, MarketPoint[]>;

async function yahooAll(symbol: string): Promise<Series> {
  const entries = await Promise.all(MARKET_RANGES.map(async (r) => [r, await yahooSeries(symbol, r)] as const));
  return Object.fromEntries(entries) as Series;
}

export async function getMarkets(): Promise<MarketsPayload> {
  const sources = new Set<string>();

  const currency = async (def: (typeof DEFS)[number]): Promise<Series | null> => {
    try {
      const s = await yahooAll(def.yahoo);
      sources.add("Yahoo Finance");
      return s;
    } catch {
      if (!def.ecb) return null;
      try {
        const year = await ecbYear(def.ecb);
        sources.add("ECB (Frankfurter)");
        return { gunluk: year.slice(-2), haftalik: lastDays(year, 7), aylik: lastDays(year, 31), yillik: year };
      } catch {
        return null;
      }
    }
  };

  const [usd, eur, gbp] = await Promise.all(DEFS.slice(0, 3).map(currency));
  const bySeries: Partial<Record<MarketKey, Series | null>> = { usd, eur, gbp };

  // Gram altın needs USD/TRY for the conversion.
  let goldPrice: number | null = null;
  if (usd) {
    try {
      const g = await yahooAll("GC=F");
      bySeries.gram_altin = Object.fromEntries(MARKET_RANGES.map((r) => [r, toGramTry(g[r], usd[r])])) as Series;
      sources.add("Yahoo Finance");
    } catch {
      try {
        const spot = await getJson<{ price?: number }>("https://api.gold-api.com/price/XAU", 600);
        const lastUsd = usd.gunluk[usd.gunluk.length - 1]?.[1];
        if (spot.price && lastUsd) goldPrice = (spot.price * lastUsd) / TROY_OUNCE_GRAMS;
        sources.add("gold-api.com");
      } catch {
        /* gold unavailable */
      }
    }
  }

  const quotes: MarketQuote[] = DEFS.map((def) => {
    const s = bySeries[def.key];
    if (!s) {
      return { key: def.key, label: def.label, pair: def.pair, price: def.key === "gram_altin" && goldPrice ? Math.round(goldPrice * 100) / 100 : null, ranges: emptyRanges() };
    }
    const ranges = Object.fromEntries(MARKET_RANGES.map((r) => [r, stats(s[r])])) as Record<MarketRange, RangeSeries>;
    const latest = s.gunluk[s.gunluk.length - 1]?.[1] ?? s.yillik[s.yillik.length - 1]?.[1] ?? null;
    return { key: def.key, label: def.label, pair: def.pair, price: latest != null ? Math.round(latest * 10_000) / 10_000 : null, ranges };
  });

  return { quotes, sources: [...sources], updatedAt: Date.now() };
}
