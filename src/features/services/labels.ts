/**
 * Turkish labels and badge tones for request / lead states (pure TS, server-safe).
 */
import { formatDate } from "@/core/format";
import type { LeadStatus, RequestStatus, WhenType } from "./types";

export type Tone = "info" | "warning" | "success" | "secondary" | "destructive";

export const WHEN_OPTIONS: Array<{ value: WhenType; label: string; description: string }> = [
  { value: "acil", label: "Acil", description: "Bugün ya da en kısa sürede" },
  { value: "bu_hafta", label: "Bu hafta", description: "Önümüzdeki birkaç gün içinde" },
  { value: "tarih", label: "Belirli bir tarih", description: "Takvimden gün seç" },
  { value: "esnek", label: "Esnek", description: "Tarih konusunda esneğim" },
];

/** "Acil", "Bu hafta", "12 Eylül Cumartesi", "Esnek". */
export function whenLabel(type: WhenType | string | null | undefined, date?: string | null): string {
  switch (type) {
    case "acil":
      return "Acil";
    case "bu_hafta":
      return "Bu hafta";
    case "tarih":
      return date ? formatDate(`${date}T12:00:00+03:00`, { month: "long", weekday: true }) : "Belirli bir tarih";
    case "esnek":
      return "Esnek";
    default:
      return "Belirtilmedi";
  }
}

/** Status of a request as the customer sees it. */
export function requestStatusMeta(status: RequestStatus | string, acceptedCount = 0): { label: string; tone: Tone } {
  switch (status) {
    case "admin_review":
      return { label: "İnceleniyor", tone: "warning" };
    case "open":
      return acceptedCount > 0 ? { label: `${acceptedCount} firma ilgilendi`, tone: "success" } : { label: "Firmalar bekleniyor", tone: "info" };
    case "filled":
      return { label: "Doldu", tone: "success" };
    case "no_match":
      return { label: "Firma aranıyor", tone: "warning" };
    case "closed_hired":
      return { label: "Kapandı · Anlaşıldı", tone: "secondary" };
    case "closed_cancelled":
      return { label: "Kapandı", tone: "secondary" };
    case "expired":
      return { label: "Süresi doldu", tone: "secondary" };
    default:
      return { label: "Bilinmiyor", tone: "secondary" };
  }
}

/** Requests the customer can still act on (Açık tab). */
export const OPEN_REQUEST_STATUSES: RequestStatus[] = ["admin_review", "open", "filled", "no_match"];

export function isRequestOpen(status: string): boolean {
  return (OPEN_REQUEST_STATUSES as string[]).includes(status);
}

/** Lead state as the business sees it (list cards). */
export function leadStatusMeta(status: LeadStatus | string, requestStatus: RequestStatus | string, hired = false): { label: string; tone: Tone } {
  if (hired) return { label: "İş sende", tone: "success" };
  switch (status) {
    case "sent":
      return requestStatus === "open" ? { label: "Yeni", tone: "info" } : { label: "Kapandı", tone: "secondary" };
    case "seen":
      return requestStatus === "open" ? { label: "Görüldü", tone: "secondary" } : { label: "Kapandı", tone: "secondary" };
    case "accepted":
      return requestStatus === "closed_hired" || requestStatus === "closed_cancelled" || requestStatus === "expired"
        ? { label: "İlgilendin · Kapandı", tone: "secondary" }
        : { label: "İlgilendin", tone: "success" };
    case "declined":
      return { label: "Gizlendi", tone: "secondary" };
    case "closed_full":
      return { label: "Doldu", tone: "secondary" };
    case "removed_by_customer":
      return { label: "Müşteri çıkardı", tone: "secondary" };
    default:
      return { label: "Kapandı", tone: "secondary" };
  }
}

/** Which business tab a lead belongs to. */
export function leadTab(status: LeadStatus | string, requestStatus: RequestStatus | string): "yeni" | "ilgilendiklerim" | "kapanan" {
  if (status === "accepted") return "ilgilendiklerim";
  if ((status === "sent" || status === "seen") && requestStatus === "open") return "yeni";
  return "kapanan";
}

/** Map an RPC ok:false reason to Turkish text. */
export function reasonMessage(reason: string | undefined, fallback = "İşlem tamamlanamadı. Lütfen tekrar dene."): string {
  switch (reason) {
    case "full":
      return "Bu talep doldu. Başka firmalar senden önce davrandı.";
    case "closed":
      return "Bu talep kapandı.";
    case "removed":
      return "Müşteri bu talepte başka firmalarla devam ediyor.";
    case "declined":
      return "Bu talebi daha önce gizlemiştin.";
    case "business_not_approved":
      return "İşletmen henüz onaylı değil.";
    case "not_found":
      return "Talep bulunamadı.";
    case "invalid_status":
      return "Talebin durumu bu işleme uygun değil. Sayfayı yenileyip tekrar dene.";
    case "not_accepted":
      return "Seçtiğin firma artık listende değil.";
    case "not_hired":
      return "Sadece anlaştığın firmayı değerlendirebilirsin.";
    case "invalid_rating":
      return "1 ile 5 arasında bir puan seç.";
    default:
      return fallback;
  }
}
