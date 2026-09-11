/**
 * Person name helpers (pure TS, tr-TR casing): "mikail şaban" -> "Mikail ŞABAN".
 */
import { trLower, trUpper } from "./tr";

export const FULL_NAME_MAX = 80;

// Letters (+ combining marks), apostrophes (iOS types ’), dots and hyphens.
const WORD_RE = /^\p{L}[\p{L}\p{M}'’.-]*$/u;

/** Words of a typed name (trimmed, any whitespace collapsed). */
export function nameWords(raw: string | null | undefined): string[] {
  return (raw ?? "").trim().split(/\s+/).filter(Boolean);
}

/** "ayşe-nur" -> "Ayşe-Nur", "IŞIK" -> "Işık" (tr-TR). */
function titleCaseTr(word: string): string {
  return trLower(word).replace(/(^|-)(\p{L})/gu, (_, sep: string, ch: string) => sep + trUpper(ch));
}

/**
 * Display form of a full name: given names in title case, the last word (surname) in upper case.
 * "ayşe nur yılmaz" -> "Ayşe Nur YILMAZ". A single word is only title-cased.
 */
export function formatFullNameTr(raw: string | null | undefined): string {
  const words = nameWords(raw);
  if (words.length === 0) return "";
  if (words.length === 1) return titleCaseTr(words[0]);
  return [...words.slice(0, -1).map(titleCaseTr), trUpper(words[words.length - 1])].join(" ");
}

/** Turkish error for a typed full name, or null when it has a given name and a surname made of letters. */
export function fullNameError(raw: string | null | undefined): string | null {
  const words = nameWords(raw);
  if (words.length === 0) return "Adını ve soyadını yaz.";
  if (!words.every((w) => WORD_RE.test(w))) return "Sadece harf kullan.";
  if (words.length < 2) return "Soyadını da yaz: adınla soyadın arasına bir boşluk bırak.";
  if (words[0].length < 2 || words[words.length - 1].length < 2) return "Ad ve soyad en az 2 harf olmalı.";
  if (formatFullNameTr(raw).length > FULL_NAME_MAX) return `En fazla ${FULL_NAME_MAX} karakter yazabilirsin.`;
  return null;
}
