/** /yardim step flow: steps, validation and URL <-> step mapping. Pure TS (unit-tested). */
import { toNationalDigits } from "@/core/phone";
import { parseTopic, type SupportTopic } from "./topics";

export type StepId = "konu" | "mesaj" | "iletisim" | "ozet";
/** Signed-in users skip "İletişim" (their account details are prefilled). */
export const GUEST_STEPS: readonly StepId[] = ["konu", "mesaj", "iletisim", "ozet"];
export const USER_STEPS: readonly StepId[] = ["konu", "mesaj", "ozet"];
export const STEP_LABEL: Record<StepId, string> = { konu: "Konu seç", mesaj: "Mesajın", iletisim: "İletişim", ozet: "Gönder" };
export const STEP_TITLE: Record<StepId, string> = {
  konu: "Yardım ve destek",
  mesaj: "Mesajını yaz",
  iletisim: "Sana nasıl ulaşalım?",
  ozet: "Kontrol et ve gönder",
};

export type Draft = { subject: string; message: string; business: string; name: string; phone: string; email: string };
export type FieldKey = "message" | "phone" | "email";
export type StepError = { step: StepId; text: string; field?: FieldKey };

export const MIN = 10;
export const MAX = 2000;
/** Same rule as the RPC. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Characters like the RPC's char_length (code points, trimmed). */
export const charLength = (s: string) => Array.from(s.trim()).length;

function messageError(d: Draft): StepError | null {
  return charLength(d.message) < MIN ? { step: "mesaj", text: "Mesajın en az 10 karakter olmalı.", field: "message" } : null;
}

function contactError(d: Draft, required: boolean): StepError | null {
  const phone = d.phone.trim();
  const email = d.email.trim();
  if (required && !phone && !email) return { step: "iletisim", text: "Sana ulaşabilmemiz için telefon ya da e-posta yaz.", field: "phone" };
  if (phone && !toNationalDigits(phone, { allowLandline: true })) return { step: "iletisim", text: "Telefon numarası geçersiz.", field: "phone" };
  if (email && !EMAIL_RE.test(email)) return { step: "iletisim", text: "E-posta adresi geçersiz.", field: "email" };
  return null;
}

/** What blocks leaving `step` ("ozet" re-checks everything). */
export function stepError(step: StepId, d: Draft, loggedIn: boolean): StepError | null {
  if (step === "mesaj") return messageError(d);
  if (step === "iletisim") return contactError(d, !loggedIn);
  if (step === "ozet") return messageError(d) ?? contactError(d, !loggedIn);
  return null;
}

/**
 * Step shown for ?konu=...&adim=...: no topic -> 0, topic alone (deep link) -> "Mesajın".
 * `requested` is what the URL asks for; `index` never passes an invalid earlier step (reload / forward).
 */
export function resolveStep(
  konu: string | null,
  adim: string | null,
  steps: readonly StepId[],
  draft: Draft,
  loggedIn: boolean,
): { topic: SupportTopic | null; requested: number; index: number } {
  const topic = parseTopic(konu);
  const requested = topic ? Math.max(1, adim ? steps.indexOf(adim as StepId) : 1) : 0;
  for (let i = 1; i < requested; i++) {
    if (stepError(steps[i], draft, loggedIn)) return { topic, requested, index: i };
  }
  return { topic, requested, index: requested };
}

/** URL of step `i` (step 1 keeps only the path). */
export function stepUrl(pathname: string, steps: readonly StepId[], i: number, topic: SupportTopic | null): string {
  const p = new URLSearchParams();
  if (i > 0 && topic) {
    p.set("konu", topic);
    if (i > 1) p.set("adim", steps[i]);
  }
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
