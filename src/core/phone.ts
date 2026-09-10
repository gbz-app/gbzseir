/**
 * Turkish phone number helpers (pure TS). Canonical storage format is E.164: +905XXXXXXXXX.
 */

/** Strip everything except digits. */
export function digitsOnly(input: string): string {
  return (input || "").replace(/\D+/g, "");
}

/**
 * Return the 10-digit national number (without leading 0), e.g. "5321234567", or null.
 * Accepts "+90 532 123 45 67", "0532...", "90532...", "532...".
 * By default only mobile numbers (starting with 5) are accepted; pass allowLandline for
 * business/landline numbers (2xx, 3xx, 4xx area codes, 850 etc.).
 */
export function toNationalDigits(input: string | null | undefined, opts: { allowLandline?: boolean } = {}): string | null {
  if (!input) return null;
  let d = digitsOnly(String(input));
  if (d.startsWith("0090")) d = d.slice(4);
  else if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10) return null;
  if (d.startsWith("5")) return d;
  if (opts.allowLandline && /^[2-48]/.test(d)) return d;
  return null;
}

/** True for a valid Turkish mobile number (5XXXXXXXXX in any common notation). */
export function isValidTRMobile(input: string | null | undefined): boolean {
  return toNationalDigits(input) !== null;
}

/** Normalize to E.164 (+90...). Mobile only unless allowLandline. Returns null when invalid. */
export function normalizePhoneTR(input: string | null | undefined, opts: { allowLandline?: boolean } = {}): string | null {
  const d = toNationalDigits(input, opts);
  return d ? `+90${d}` : null;
}

/** Supabase auth stores phones without '+'. Convert "905..." or "+905..." to E.164. */
export function fromSupabasePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return normalizePhoneTR(phone.startsWith("+") ? phone : `+${phone}`, { allowLandline: true });
}

/** Progressive input mask "5XX XXX XX XX" for up to 10 national digits. */
export function formatPhoneInputTR(raw: string): string {
  let d = digitsOnly(raw);
  if (d.startsWith("90") && d.length > 10) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  d = d.slice(0, 10);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean);
  return parts.join(" ");
}

/** tel: href for a TR number (falls back to the digits as given). */
export function telHref(phone: string): string {
  const e164 = normalizePhoneTR(phone, { allowLandline: true });
  return `tel:${e164 ?? digitsOnly(phone)}`;
}
