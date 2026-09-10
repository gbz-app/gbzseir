/**
 * İlanlara özgü biçimlendirme ve durum yardımcıları (saf TS).
 */
import { formatPrice, formatPriceRange } from "@/core/format";
import { TIMEZONE } from "@/core/time";
import type { ListingStatus } from "./constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

/** 2. el fiyatı: 0 -> "Ücretsiz", boş -> "Fiyat belirtilmemiş". */
export function listingPriceText(price: number | null | undefined): string {
  if (price === 0) return "Ücretsiz";
  return formatPrice(price, { fallback: "Fiyat belirtilmemiş" });
}

/** Maaş metni: gizli ya da boşsa "Maaş: Görüşülür". */
export function salaryText(min: number | null | undefined, max: number | null | undefined, hidden: boolean): string {
  if (hidden || (min == null && max == null)) return "Maaş: Görüşülür";
  return formatPriceRange(min, max);
}

export function isSalaryVisible(min: number | null | undefined, max: number | null | undefined, hidden: boolean): boolean {
  return !hidden && (min != null || max != null);
}

/** Kısa ilan numarası: uuid'nin ilk 8 hanesi ("1940CB14"). */
export function listingNo(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLocaleUpperCase("tr-TR");
}

const monthYearFmt = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: TIMEZONE });

/** "Eylül 2026" */
export function formatMonthYear(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : monthYearFmt.format(d);
}

export function isPastExpiry(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= Date.now();
}

/** Publicly visible and contactable right now (active + not expired). */
export function isListingLive(l: { status: ListingStatus | string; expires_at: string }): boolean {
  return l.status === "active" && !isPastExpiry(l.expires_at);
}

/** Effective status for display: an active/paused listing past its expiry is shown as expired. */
export function effectiveStatus(l: { status: ListingStatus; expires_at: string }): ListingStatus {
  if ((l.status === "active" || l.status === "paused") && isPastExpiry(l.expires_at)) return "expired";
  return l.status;
}

/** Days left until expiry (0 when expired). */
export function daysLeft(expiresAt: string): number {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
}

/** Only digits (for price / salary inputs). */
export function digitsOnly(v: string): string {
  return v.replace(/\D+/g, "");
}

/** "18500" -> "18.500" while typing. */
export function groupDigits(v: string): string {
  const d = digitsOnly(v).replace(/^0+(?=\d)/, "");
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
