/** Small parsing helpers for the owner forms (pure TS). */
import { formatTime } from "@/core/format";
import { istanbulDateKey } from "@/core/time";

/**
 * "1.250,50" / "1250.5" / "90 TL" -> number (2 decimals). Empty -> null. Invalid -> undefined.
 */
export function parseAmount(raw: string): number | null | undefined {
  const t = raw
    .trim()
    .replace(/tl|₺|\s/gi, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : undefined;
}

/** Number input text for an amount: 1250.5 -> "1250,5". */
export function amountInput(v: number | null | undefined): string {
  return v == null ? "" : String(v).replace(".", ",");
}

/** "ornek.com" -> "https://ornek.com". Empty -> null. Invalid -> undefined. */
export function normalizeUrl(raw: string, max = 300): string | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".") || withScheme.length > max) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** "@kulekahve" / "instagram.com/kulekahve" -> "kulekahve". Empty -> null. Invalid -> undefined. */
export function normalizeInstagram(raw: string): string | null | undefined {
  const t = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  if (!t) return null;
  return /^[A-Za-z0-9._]{1,30}$/.test(t) ? t : undefined;
}

/** Istanbul local date + time -> ISO with offset (Turkey is UTC+3 all year). */
export function istanbulIso(date: string, time: string): string {
  return `${date}T${time}:00+03:00`;
}

/** ISO -> { date: "YYYY-MM-DD", time: "HH:MM" } in Istanbul. */
export function istanbulParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: istanbulDateKey(d), time: formatTime(d) };
}
