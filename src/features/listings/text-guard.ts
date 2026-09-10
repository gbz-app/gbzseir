/**
 * Client-side mirror of private.listing_flags(): warns the user while typing.
 * The database computes the real flags; flagged listings go to moderation.
 */
import { trNormalize } from "@/core/tr";

export type TextRisk = "iban" | "odeme" | "telefon" | "url";

const IBAN_RE = /TR\s?\d{2}[0-9 ]{20,}/i;
const PAYMENT_RE = /(kapora|on odeme|onodeme|kargo ile|kayit ucreti)/;
const MOBILE_RE = /(^|\D)(\+?90|0)?5\d{9}(\D|$)/;
const LANDLINE_RE = /(^|\D)(\+?90|0)[2-4]\d{9}(\D|$)/;
const SPECIAL_RE = /(^|\D)0?850\d{7}(\D|$)/;
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com\.tr|com|net|org|tr|io|me|link|ly)\b)/i;

export function detectTextRisks(...texts: Array<string | null | undefined>): TextRisk[] {
  const t = texts.filter(Boolean).join(" ");
  if (!t.trim()) return [];
  const n = trNormalize(t);
  const compact = t.replace(/[\s().\-/]/g, "");
  const out: TextRisk[] = [];
  if (IBAN_RE.test(t)) out.push("iban");
  if (PAYMENT_RE.test(n)) out.push("odeme");
  if (MOBILE_RE.test(compact) || LANDLINE_RE.test(compact) || SPECIAL_RE.test(compact)) out.push("telefon");
  if (URL_RE.test(t)) out.push("url");
  return out;
}

export const TEXT_RISK_LABELS: Record<TextRisk, string> = {
  iban: "IBAN",
  odeme: "kapora / ön ödeme ifadesi",
  telefon: "telefon numarası",
  url: "web adresi",
};
