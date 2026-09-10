/**
 * Turkish text helpers (pure TS). Handles the I/ı/İ/i problem for search and slugs.
 */

export function trLower(s: string | null | undefined): string {
  return (s ?? "").toLocaleLowerCase("tr-TR");
}

export function trUpper(s: string | null | undefined): string {
  return (s ?? "").toLocaleUpperCase("tr-TR");
}

const FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  i: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/**
 * Normalize for accent-insensitive search: tr lowercase, fold Turkish letters to ASCII,
 * strip other diacritics, collapse whitespace. "İstanbul Çarşı" -> "istanbul carsi".
 */
export function trNormalize(s: string | null | undefined): string {
  return trLower(s)
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Accent-insensitive "contains" check. */
export function trIncludes(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const n = trNormalize(needle);
  if (!n) return true;
  return trNormalize(haystack).includes(n);
}

/** URL slug: "Gebze Çoban Mustafa Paşa Külliyesi" -> "gebze-coban-mustafa-pasa-kulliyesi". */
export function slugifyTr(s: string | null | undefined, maxLength = 80): string {
  return trNormalize(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Turkish collation for sorting. */
export function trCompare(a: string, b: string): number {
  return a.localeCompare(b, "tr-TR", { sensitivity: "base" });
}

/** First letter upper-case (Turkish aware): "istanbul" -> "İstanbul". */
export function trCapitalize(s: string | null | undefined): string {
  const t = s ?? "";
  return t ? trUpper(t[0]) + t.slice(1) : t;
}
