/** searchParams helpers for admin pages (pure TS). */

export type SearchParamValue = string | string[] | undefined;

/** First non-empty value of a search param. */
export function one(v: SearchParamValue): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  const t = x?.trim();
  return t ? t : undefined;
}

/** 1-based page number (defaults to 1). */
export function pageParam(v: SearchParamValue): number {
  const n = Number(one(v));
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

/** Value restricted to an allow-list. */
export function oneOf<T extends string>(v: SearchParamValue, allowed: readonly T[], fallback: T): T {
  const x = one(v);
  return x && (allowed as readonly string[]).includes(x) ? (x as T) : fallback;
}

/** Free text made safe for PostgREST ilike / or() filters (no wildcards, commas, parentheses or quotes). */
export function searchTerm(v: SearchParamValue): string | undefined {
  const s = one(v)
    ?.replace(/[%_,()*\\:"'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return s ? s : undefined;
}

/** Range for .range(from, to) of a 1-based page. */
export function pageRange(page: number, size: number): { from: number; to: number } {
  const from = (page - 1) * size;
  return { from, to: from + size - 1 };
}
